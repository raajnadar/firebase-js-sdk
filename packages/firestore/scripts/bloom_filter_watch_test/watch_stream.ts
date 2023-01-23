/**
 * @license
 * Copyright 2023 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import { newConnection } from '../../src/platform/connection';
import { DatabaseId, DatabaseInfo } from '../../src/core/database_info';
import {
  DocumentChange,
  DocumentDelete,
  DocumentRemove,
  ExistenceFilter,
  ListenRequest,
  ListenResponse,
  TargetChange
} from '../../src/protos/firestore_proto_api';
import { Connection, Stream } from "../../src/remote/connection";
import { Deferred } from "../../test/util/promise";
import {BloomFilter} from "../../src/remote/bloom_filter";
import {normalizeByteString} from "../../src/model/normalize";

export interface WatchStreamAddTargetInfo {
  projectId: string,
  collectionId: string,
  keyFilter: string,
  valueFilter: string,
  resume?: {
    from: TargetSnapshot,
    expectedCount: number
  }
}

export interface TargetHandle {
  targetId: number;
}

export class WatchStream {

  private _stream: Stream<unknown, unknown> | null = null;
  private _closed = false;
  private _closedDeferred = new Deferred<void>();
  private _nextTargetId = 1;

  private _targets = new Map<number, TargetState>();

  constructor(
    private readonly _connection: Connection,
    private readonly _projectId: string) {
  }

  open(): Promise<void> {
    if (this._stream) {
      throw new WatchError("open() may only be called once");
    } else if (this._closed) {
      throw new WatchError("open() may not be called after close()");
    }

    const deferred = new Deferred<void>();

    const stream = this._connection.openStream("Listen", null, null);
    try {
      stream.onOpen(() => {
        deferred.resolve(null as unknown as void);
      });

      stream.onClose(err => {
        if (err) {
          deferred.reject(err as Error);
          this._closedDeferred.reject(err as Error);
        } else {
          deferred.resolve(null as unknown as void);
          this._closedDeferred.resolve(null as unknown as void);
        }
      });

      stream.onMessage(msg => {
        this._onMessageReceived(msg as ListenResponse);
      });
    } catch (err) {
      stream.close();
      throw err;
    }

    this._stream = stream;

    return deferred.promise;
  }

  close(): Promise<void> {
    this._closed = true;

    if (! this._stream) {
      return Promise.resolve();
    }

    this._stream.close();

    return this._closedDeferred.promise;
  }

  async addTarget(targetInfo: WatchStreamAddTargetInfo): Promise<TargetHandle> {
    const targetId = this._nextTargetId++;

    if (!this._stream) {
      throw new WatchError("open() must be called before addTarget()");
    } else if (this._closed) {
      throw new WatchError("addTarget() may not be called after close()");
    }

    const listenRequest: ListenRequest = {
      addTarget: {
        targetId,
        query: {
          parent: `projects/${targetInfo.projectId}/databases/(default)/documents`,
          structuredQuery: {
            from: [{collectionId: targetInfo.collectionId}],
            where: {
              fieldFilter: {
                field: {
                  fieldPath: targetInfo.keyFilter
                },
                op: "EQUAL",
                value: {
                  stringValue: targetInfo.valueFilter
                }
              }
            },
            orderBy: [
              { field: { fieldPath: '__name__' }, direction: 'ASCENDING' }
            ]
          },
        },
      }
    };

    if (targetInfo?.resume !== undefined) {
      listenRequest.addTarget!.resumeToken = targetInfo.resume.from.resumeToken;
      listenRequest.addTarget!.expectedCount = targetInfo.resume.expectedCount;
    }

    const targetState = new TargetState(targetId, targetInfo?.resume?.from.documentPaths);
    this._targets.set(targetId, targetState);
    this.sendListenRequest(listenRequest);

    await targetState.addedPromise;

    return { targetId };
  }

  removeTarget(targetHandle: TargetHandle): Promise<void> {
    const targetId = targetHandle.targetId;

    if (!this._stream) {
      throw new WatchError("open() must be called before removeTarget()");
    } else if (this._closed) {
      throw new WatchError("removeTarget() may not be called after close()");
    }

    const targetState = this._targets.get(targetId);
    if (targetState === undefined) {
      throw new WatchError(`targetId ${targetId} has not been added by addTarget()`);
    }

    this.sendListenRequest({
      removeTarget: targetId
    });

    return targetState.removedPromise;
  }

  private sendListenRequest(listenRequest: ListenRequest): void {
    this._stream!.send({
        database: `projects/${this._projectId}/databases/(default)`,
        ...listenRequest
      }
    );
  }

  getInitialSnapshot(targetHandle: TargetHandle): Promise<TargetSnapshot> {
    const targetId = targetHandle.targetId;
    const targetState = this._targets.get(targetId);
    if (targetState === undefined) {
      throw new WatchError(`unknown targetId: ${targetId}`);
    }
    return targetState.initialSnapshotPromise;
  }

  getExistenceFilter(targetHandle: TargetHandle): Promise<BloomFilter | null> {
    const targetId = targetHandle.targetId;
    const targetState = this._targets.get(targetId);
    if (targetState === undefined) {
      throw new WatchError(`unknown targetId: ${targetId}`);
    }
    return targetState.existenceFilterPromise;
  }

  private _onMessageReceived(msg: ListenResponse): void {
    if (msg.targetChange) {
      this._onTargetChange(msg.targetChange);
    } else if (msg.documentChange) {
      this._onDocumentChange(msg.documentChange);
    } else if (msg.documentRemove) {
      this._onDocumentRemove(msg.documentRemove);
    } else if (msg.documentDelete) {
      this._onDocumentDelete(msg.documentDelete);
    } else if (msg.filter) {
      this._onExistenceFilter(msg.filter);
    }
  }

  private _targetStatesForTargetIds(targetIds: Array<number>, allTargetsIfEmpty: boolean): Array<TargetState> {
    const targetStates = Array.from(targetIds, targetId => {
      const targetState = this._targets.get(targetId);
      if (targetState === undefined) {
        throw new WatchError(`TargetChange specifies an unknown targetId: ${targetId}`);
      }
      return targetState;
    });

    if (targetStates.length > 0 || !allTargetsIfEmpty) {
      return targetStates;
    }

    // If an empty list of target IDs was specified, then this means that the
    // event applies to _all_ targets.
    return Array.from(this._targets.values());
  }

  private _onTargetChange(targetChange: TargetChange): void {
    const targetStates = this._targetStatesForTargetIds(targetChange.targetIds ?? [], true);
    for (const targetState of targetStates) {
      const error = targetChange.cause;
      if (error) {
        targetState.onError(error);
        continue;
      }

      switch (targetChange.targetChangeType ?? "NO_CHANGE") {
        case "ADD":
          targetState.onAdded();
          break;
        case "REMOVE":
          targetState.onRemoved();
          this._targets.delete(targetState.targetId);
          break;
        case "CURRENT":
          targetState.onCurrent();
          break;
        case "RESET":
          targetState.onReset();
          break;
        case "NO_CHANGE":
          targetState.onNoChange(targetChange.resumeToken ?? null);
          break;
        default:
          throw new WatchError(`unknown targetChangeType: ${targetChange.targetChangeType}`);
      }
    }
  }

  private _onDocumentChange(documentChange: DocumentChange): void {
    for (const targetState of this._targetStatesForTargetIds(documentChange.targetIds ?? [], true)) {
      targetState.onDocumentChanged(documentChange.document!.name!);
    }
    for (const targetState of this._targetStatesForTargetIds(documentChange.removedTargetIds ?? [], false)) {
      targetState.onDocumentRemoved(documentChange.document!.name!);
    }
  }

  private _onDocumentRemove(documentRemove: DocumentRemove): void {
    for (const targetState of this._targetStatesForTargetIds(documentRemove.removedTargetIds ?? [], false)) {
      targetState.onDocumentRemoved(documentRemove.document!);
    }
  }

  private _onDocumentDelete(documentDelete: DocumentDelete): void {
    for (const targetState of this._targetStatesForTargetIds(documentDelete.removedTargetIds ?? [], false)) {
      targetState.onDocumentRemoved(documentDelete.document!);
    }
  }

  private _onExistenceFilter(existenceFilter: ExistenceFilter): void {
    const targetId = existenceFilter.targetId;
    const targetState = this._targets.get(targetId!);
    if (targetState === undefined) {
      throw new WatchError(`ExistenceFilter specified an unknown targetId: ${targetId}`);
    }
    targetState.onExistenceFilter(existenceFilter);
  }

}

export function createWatchStream(projectId: string, host: string, ssl: boolean): WatchStream {
  const databaseInfo = createDatabaseInfo(projectId, host, ssl);
  const connection = newConnection(databaseInfo);
  return new WatchStream(connection, projectId);
}

function createDatabaseInfo(projectId: string, host: string, ssl: boolean): DatabaseInfo {
  return new DatabaseInfo(
    new DatabaseId(projectId),
    /*appId=*/"",
    /*persistenceKey=*/"[DEFAULT]",
    host,
    ssl,
    /*forceLongPolling=*/false,
    /*autoDetectLongPolling=*/false,
    /*useFetchStreams=*/true
  );
}

class WatchError extends Error {
  name = "WatchError";
}

class TargetStateError extends Error {
  name = "TargetStateError";
}

export class TargetSnapshot {
  readonly type = "TargetSnapshot";
  constructor(readonly documentPaths: Set<string>, readonly resumeToken: string | Uint8Array) {
  }
}

class TargetState {
  private _added = false;
  private _removed = false;
  private _current = false;

  private readonly _accumulatedDocumentNames = new Set<string>();

  private readonly _addedDeferred = new Deferred<void>();
  private readonly _removedDeferred = new Deferred<void>();
  private readonly _initialSnapshotDeferred = new Deferred<TargetSnapshot>();
  private readonly _existenceFilterDeferred = new Deferred<BloomFilter | null>();

  constructor(readonly targetId: number, initialDocumentPaths?: Set<string>) {
    if (initialDocumentPaths) {
      for (const documentPath of Array.from(initialDocumentPaths.values())) {
        this._accumulatedDocumentNames.add(documentPath);
      }
    }
  }

  get addedPromise(): Promise<void> {
    return this._addedDeferred.promise;
  }

  get removedPromise(): Promise<void> {
    return this._removedDeferred.promise;
  }

  get initialSnapshotPromise(): Promise<TargetSnapshot> {
    return this._initialSnapshotDeferred.promise;
  }

  get existenceFilterPromise(): Promise<BloomFilter | null> {
    return this._existenceFilterDeferred.promise;
  }

  onError(error: unknown): void {
    this._addedDeferred.reject(error as Error);
    this._removedDeferred.reject(error as Error);
    this._initialSnapshotDeferred.reject(error as Error);
    this._existenceFilterDeferred.reject(error as Error);
  }

  onAdded(): void {
    if (this._added) {
      throw new TargetStateError(`onAdded() already invoked.`);
    }
    this._added = true;
    this._addedDeferred.resolve(null as unknown as void);
  }

  onRemoved(): void {
    if (this._removed) {
      throw new TargetStateError(`onRemoved() already invoked.`);
    }
    if (!this._added) {
      throw new TargetStateError(`onRemoved() invoked before onAdded().`);
    }
    this._removed = true;
    this._removedDeferred.resolve(null as unknown as void);
  }

  onCurrent(): void {
    if (!this._added) {
      throw new TargetStateError(`onCurrent() invoked before onAdded().`);
    }
    if (this._removed) {
      throw new TargetStateError(`onCurrent() invoked after onRemoved().`);
    }
    this._current = true;
  }

  onReset(): void {
    if (!this._added) {
      throw new TargetStateError(`onReset() invoked before onAdded().`);
    }
    if (this._removed) {
      throw new TargetStateError(`onReset() invoked after onRemoved().`);
    }
    this._current = false;
    this._accumulatedDocumentNames.clear();
  }

  onNoChange(resumeToken: string | Uint8Array | null): void {
    if (!this._added) {
      throw new TargetStateError(`onNoChange() invoked before onAdded().`);
    }
    if (this._removed) {
      throw new TargetStateError(`onNoChange() invoked after onRemoved().`);
    }
    if (this._current && resumeToken !== null) {
      const documentPaths = new Set(this._accumulatedDocumentNames);
      this._initialSnapshotDeferred.resolve(new TargetSnapshot(documentPaths, resumeToken));
    }
  }

  onDocumentChanged(documentName: string): void {
    if (!this._added) {
      throw new TargetStateError(`onDocumentChanged() invoked when not added.`);
    }
    if (this._removed) {
      throw new TargetStateError(`onDocumentChanged() invoked after onRemoved().`);
    }
    this._current = false;
    this._accumulatedDocumentNames.add(documentName);
  }

  onDocumentRemoved(documentName: string): void {
    if (!this._added) {
      throw new TargetStateError(`onDocumentRemoved() invoked when not added.`);
    }
    if (this._removed) {
      throw new TargetStateError(`onDocumentRemoved() invoked after onRemoved().`);
    }
    this._current = false;
    this._accumulatedDocumentNames.delete(documentName);
  }

  onExistenceFilter(existenceFilter: ExistenceFilter): void {
    if (!this._added) {
      throw new TargetStateError(`onExistenceFilter() invoked when not added.`);
    }
    if (this._removed) {
      throw new TargetStateError(`onExistenceFilter() invoked after onRemoved().`);
    }

    this._existenceFilterDeferred.resolve(createBloomFilterFrom(existenceFilter));
  }
}


class InvalidBloomFilterError extends Error {
  readonly name = "InvalidBloomFilterError";
}

function createBloomFilterFrom(existenceFilter: ExistenceFilter): BloomFilter | null {
  if (existenceFilter.unchangedNames === undefined) {
    return null;
  }

  const padding = existenceFilter.unchangedNames.bits?.padding ?? 0;
  const hashCount = existenceFilter.unchangedNames.hashCount ?? 0;
  if (padding < 0 || padding > 7) {
    throw new InvalidBloomFilterError(`invalid padding size: ${padding}`);
  }
  if (hashCount < 0) {
    throw new InvalidBloomFilterError(`invalid hash count: ${hashCount}`);
  }

  const bitmap = existenceFilter.unchangedNames.bits?.bitmap ?? '';
  const bytes = normalizeByteString(bitmap).toUint8Array();
  if (hashCount === 0 && bytes.length > 0) {
    throw new InvalidBloomFilterError(`non-zero hash count ${hashCount} when bitmap size is zero`);
  }

  return new BloomFilter(bytes, padding, hashCount);
}