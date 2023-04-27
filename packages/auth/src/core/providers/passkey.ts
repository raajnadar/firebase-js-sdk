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

import { ProviderId } from '../../model/enums';
import { AuthProvider } from '../../model/public_types';
import { PasskeyAuthCredential } from '../credentials/passkey';

/**
 * Provider for generating {@link PasskeyAuthCredential}.
 *
 * @public
 */
export class PasskeyAuthProvider implements AuthProvider {
  /**
   * Always set to {@link ProviderId}.PASSWORD, even for passkey link.
   */
  static readonly PROVIDER_ID: 'passkey' = ProviderId.PASSKEY;
  /**
   * Always set to {@link ProviderId}.PASSWORD, even for passkey link.
   */
  readonly providerId = PasskeyAuthProvider.PROVIDER_ID;

  static async getCredential(
    options: PublicKeyCredentialRequestOptions
  ): Promise<PublicKeyCredential> {
    console.log('!!!!! PasskeyAuthCredential getCredential');
    const publicKey = {
      challenge: options.challenge,
      rpId: options.rpId,
      userVerification: options.userVerification
      //   rp: {
      //     // name: 'Example Inc.',
      //     id: rpId
      //   },
      //   user: {
      //     id: new Uint8Array(16),
      //     name: 'john.doe@example.com',
      //     displayName: 'John Doe'
      //   }
      //   pubKeyCredParams: [
      //     {
      //       type: 'public-key',
      //       alg: -7 // "ES256" IANA COSE Algorithms registry value
      //     }
      //   ],
      //   authenticatorSelection: {
      //     authenticatorAttachment: 'platform',
      //     requireResidentKey: false
      //   },
      //   timeout: 60000,
      //   attestation: 'direct',
      //   extensions: {}
    };

    // call navigator.credentials.get() with the publicKey options
    try {
      const cred = (await navigator.credentials.get({
        publicKey
      })) as PublicKeyCredential;
      return cred;
    } catch (err) {
      console.error(err);
      throw err;
    }
  }

  static async createCredential(
    options: PublicKeyCredentialCreationOptions
  ): Promise<PublicKeyCredential> {
    console.log('!!!!! PasskeyAuthCredential createCredential');
    try {
      const cred = (await navigator.credentials.create({
        publicKey: options
      })) as PublicKeyCredential;
      return cred;
    } catch (err) {
      console.error(err);
      throw err;
    }
  }
}
