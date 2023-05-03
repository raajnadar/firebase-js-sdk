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

import { Auth, User, UserCredential } from '../../model/public_types';

import {
  startPasskeyEnrollment,
  StartPasskeyEnrollmentRequest,
  StartPasskeyEnrollmentResponse,
  finalizePasskeyEnrollment,
  FinalizePasskeyEnrollmentRequest,
  FinalizePasskeyEnrollmentResponse,
  startPasskeySignin,
  StartPasskeySigninRequest,
  StartPasskeySigninResponse,
  finalizePasskeySignin,
  FinalizePasskeySigninRequest,
  FinalizePasskeySigninResponse
} from '../../api/account_management/passkey';
import { UserInternal } from '../../model/user';
import { _castAuth } from '../auth/auth_impl';
import { getModularInstance } from '@firebase/util';
import { signUp } from '../../api/authentication/sign_up';
import { OperationType } from '../../model/enums';
import { UserCredentialImpl } from '../user/user_credential_impl';
import { PasskeyAuthProvider } from '../providers/passkey';
import { signInAnonymously } from './anonymous';

export async function signInWithPasskey(auth: Auth): Promise<UserCredential> {
  console.log('!!!!! signInWithPasskey');
  const authInternal = _castAuth(auth);
  const encoder = new TextEncoder();

  // Start Passkey Sign in
  const startSignInRequest: StartPasskeySigninRequest = {
    sessionId: 'fake-session-id'
  };
  // const startSignInResponse = await startPasskeyEnrollment(authInternal, startSignInRequest);
  const startSignInResponse: StartPasskeySigninResponse = {
    localId: 'fake-local-id',
    credentialRequestOptions: {
      challenge: encoder.encode('fake-challenge').buffer,
      rpId: 'localhost',
      userVerification: 'required',
      allowCredentials: [
        {
          publicKey: {
            name: 'johndoe@example.com'
          }
        }
      ]
    }
  };
;
  // Get crendentials
  await PasskeyAuthProvider.getCredential(
    startSignInResponse.credentialRequestOptions
  )
    .then(async cred => {
      // Sign in an existing user
      console.log('getCredential then');
      console.log(cred);
      // Finish Passkey Sign in
      const finalizeSignInRequest = {
        sessionId: encoder.encode('fake-session-id'),
        authenticatorAuthenticationResponse: {
          credentialId: encoder.encode(cred?.id),
          authenticatorAssertionResponse: cred?.response,
          credentialType: cred?.type
        }
      };
      // const finalizeSignInResponse = await finalizePasskeySignin(authInternal, finalizeSignInRequest);
      const finalizeSignInResponse = {
        localId: 'fake-local-id',
        idToken: 'fake-id-token',
        refreshToken: 'fake-refresh-token'
      };
      const operationType = OperationType.SIGN_IN;
      const userCredential = await UserCredentialImpl._fromIdTokenResponse(
        authInternal,
        operationType,
        finalizeSignInResponse
      );
      await auth.updateCurrentUser(userCredential.user);
      return userCredential;
    })
    .catch(err => {
      console.log('getCredential catch');
      console.log(err);
      // Sign up a new user
      signInAnonymously(authInternal)
        .then(async userCredential => {
          await auth.updateCurrentUser(userCredential.user);
          await linkWithPasskey(auth.currentUser!);
        })
        .catch(err => {
          console.log(err);
        });
    });

  return Promise.reject(new Error('signInWithPasskey Not implemented'));
}

/**
 * Links the user account with the given phone number.
 *
 * @param user - The user.
 *
 * @public
 */
export async function linkWithPasskey(user: User): Promise<UserCredential> {
  console.log('!!!!! linkWithPasskey');
  const userInternal = getModularInstance(user) as UserInternal;
  const encoder = new TextEncoder();

  // Start Passkey Enrollment
  const idToken = await userInternal.getIdToken();
  const startEnrollmentRequest: StartPasskeyEnrollmentRequest = {
    idToken
  };
  // const startEnrollmentResponse = await startPasskeyEnrollment(authInternal, startEnrollmentRequest);
  const startEnrollmentResponse: StartPasskeyEnrollmentResponse = {
    credentialCreationOptions: {
      rp: {
        id: 'localhost',
        name: 'localhost' // To be set
      },
      user: {
        id: encoder.encode('fake-user-id'),
        name: user.email ? user.email! : 'fake-user-name', // To be set
        displayName: user.displayName ? user.displayName! : 'fake-display-name' // To be set
      },
      challenge: encoder.encode('fake-challenge').buffer,
      pubKeyCredParams: [
        {
          type: 'public-key',
          alg: -7 // "ES256" IANA COSE Algorithms registry value
        },
        {
          type: 'public-key',
          alg: -257 // "RS256" IANA COSE Algorithms registry value
        }
      ],
      authenticatorSelection: {},
      excludeCredentials: []
    }
  };

  // Create the crendential
  await PasskeyAuthProvider.createCredential(
    startEnrollmentResponse.credentialCreationOptions!
  )
    .then(async cred => {
      console.log('createCredential then');
      console.log(cred);

      // Finish Passkey Enrollment
      const finalizeEnrollmentRequest: FinalizePasskeyEnrollmentRequest = {
        idToken,
        authenticatorRegistrationResponse: {
          credentialId: encoder.encode(cred?.id),
          authenticatorAttestationResponse:
            cred?.response as AuthenticatorAttestationResponse,
          credentialType: cred?.type
        }
      };
      // const finalizeEnrollmentResponse = await finalizePasskeyEnrollment(authInternal, finalizeEnrollmentRequest);
      const finalizeEnrollmentResponse: FinalizePasskeyEnrollmentResponse = {
        localId: 'fake-local-id',
        idToken: 'fake-id-token',
        refreshToken: 'fake-refresh-token'
      };
      const operationType = OperationType.LINK;
      const userCredential = await UserCredentialImpl._fromIdTokenResponse(
        userInternal.auth,
        operationType,
        finalizeEnrollmentResponse
      );
    })
    .catch(err => {
      console.log(err);
    });

  return Promise.reject(new Error('linkWithPasskey Not implemented'));
}
