/**
 * @license
 * Copyright 2020 Google LLC
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

import { ProviderId, SignInMethod } from '../../model/enums';
import { startPasskeyEnrollment } from '../../api/account_management/passkey';
import { AuthInternal } from '../../model/auth';
import { IdTokenResponse } from '../../model/id_token';
import { _fail } from '../util/assert';
import { AuthCredential } from './auth_credential';
/**
 * Interface that represents the credentials returned by {@link EmailAuthProvider} for
 * {@link ProviderId}.PASSWORD
 *
 * @remarks
 * Covers both {@link SignInMethod}.EMAIL_PASSWORD and
 * {@link SignInMethod}.EMAIL_LINK.
 *
 * @public
 */
export class PasskeyAuthCredential extends AuthCredential {
  constructor(
    /** @internal */
    readonly _email: string
  ) {
    super(ProviderId.PASSKEY, SignInMethod.PASSKEY);
  }

  /** @internal */
  static _create(email: string): PasskeyAuthCredential {
    return new PasskeyAuthCredential(email);
  }

  /** @internal */
  static _get(email: string): PasskeyAuthCredential {
    return new PasskeyAuthCredential(email);
  }

  /** {@inheritdoc AuthCredential.toJSON} */
  toJSON(): object {
    return {
      email: this._email
    };
  }

  /**
   * Static method to deserialize a JSON representation of an object into an {@link  AuthCredential}.
   *
   * @param json - Either `object` or the stringified representation of the object. When string is
   * provided, `JSON.parse` would be called first.
   *
   * @returns If the JSON input does not represent an {@link AuthCredential}, null is returned.
   */
  static fromJSON(json: object | string): PasskeyAuthCredential | null {
    // const obj = typeof json === 'string' ? JSON.parse(json) : json;
    // if (obj?.email && obj?.password) {
    //   if (obj.signInMethod === SignInMethod.EMAIL_PASSWORD) {
    //     return this._fromEmailAndPassword(obj.email, obj.password);
    //   } else if (obj.signInMethod === SignInMethod.EMAIL_LINK) {
    //     return this._fromEmailAndCode(obj.email, obj.password, obj.tenantId);
    //   }
    // }
    return null;
  }

  /** @internal */
  async _getIdTokenResponse(auth: AuthInternal): Promise<IdTokenResponse> {
    return Promise.reject(
      new Error('PasskeyAuthCredential _getIdTokenResponse Not implemented')
    );
  }

  /** @internal */
  async _linkToIdToken(
    auth: AuthInternal,
    idToken: string
  ): Promise<IdTokenResponse> {
    return Promise.reject(
      new Error('PasskeyAuthCredential _linkToIdToken Not implemented')
    );
  }

  /** @internal */
  _getReauthenticationResolver(auth: AuthInternal): Promise<IdTokenResponse> {
    return this._getIdTokenResponse(auth);
  }
}
