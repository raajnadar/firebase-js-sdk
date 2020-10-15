<!-- Do not edit this file. It is automatically generated by API Documenter. -->

[Home](./index.md) &gt; [@firebase/auth-types](./auth-types.md) &gt; [ActionCodeURL](./auth-types.actioncodeurl.md)

## ActionCodeURL class

A utility class to parse email action URLs such as password reset, email verification, email link sign in, etc.

<b>Signature:</b>

```typescript
export abstract class ActionCodeURL 
```

## Properties

|  Property | Modifiers | Type | Description |
|  --- | --- | --- | --- |
|  [apiKey](./auth-types.actioncodeurl.apikey.md) |  | string | The API key of the email action link. |
|  [code](./auth-types.actioncodeurl.code.md) |  | string | The action code of the email action link. |
|  [continueUrl](./auth-types.actioncodeurl.continueurl.md) |  | string \| null | The continue URL of the email action link. Null if not provided. |
|  [languageCode](./auth-types.actioncodeurl.languagecode.md) |  | string \| null | The language code of the email action link. Null if not provided. |
|  [operation](./auth-types.actioncodeurl.operation.md) |  | [Operation](./auth-types.operation.md) | The action performed by the email action link. It returns from one of the types from [ActionCodeInfo](./auth-types.actioncodeinfo.md) |
|  [tenantId](./auth-types.actioncodeurl.tenantid.md) |  | string \| null | The tenant ID of the email action link. Null if the email action is from the parent project. |

## Methods

|  Method | Modifiers | Description |
|  --- | --- | --- |
|  [parseLink(link)](./auth-types.actioncodeurl.parselink.md) | <code>static</code> | Parses the email action link string and returns an ActionCodeURL object if the link is valid, otherwise returns null. |
