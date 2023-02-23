/**
 * @generated SignedSource<<89a508d8e21647fab818c211d4f18361>>
 * @lightSyntaxTransform
 * @nogrep
 */

/* tslint:disable */
/* eslint-disable */
// @ts-nocheck

import { ConcreteRequest, Query } from 'relay-runtime';
export type AppAllPostQuery$variables = {};
export type AppAllPostQuery$data = {
  readonly allPosts: ReadonlyArray<{
    readonly id: string;
    readonly title: string;
    readonly user_id: string;
    readonly views: number;
  } | null> | null;
};
export type AppAllPostQuery = {
  response: AppAllPostQuery$data;
  variables: AppAllPostQuery$variables;
};

const node: ConcreteRequest = (function(){
var v0 = [
  {
    "alias": null,
    "args": null,
    "concreteType": "Post",
    "kind": "LinkedField",
    "name": "allPosts",
    "plural": true,
    "selections": [
      {
        "alias": null,
        "args": null,
        "kind": "ScalarField",
        "name": "id",
        "storageKey": null
      },
      {
        "alias": null,
        "args": null,
        "kind": "ScalarField",
        "name": "user_id",
        "storageKey": null
      },
      {
        "alias": null,
        "args": null,
        "kind": "ScalarField",
        "name": "title",
        "storageKey": null
      },
      {
        "alias": null,
        "args": null,
        "kind": "ScalarField",
        "name": "views",
        "storageKey": null
      }
    ],
    "storageKey": null
  }
];
return {
  "fragment": {
    "argumentDefinitions": [],
    "kind": "Fragment",
    "metadata": null,
    "name": "AppAllPostQuery",
    "selections": (v0/*: any*/),
    "type": "Query",
    "abstractKey": null
  },
  "kind": "Request",
  "operation": {
    "argumentDefinitions": [],
    "kind": "Operation",
    "name": "AppAllPostQuery",
    "selections": (v0/*: any*/)
  },
  "params": {
    "cacheID": "a2194127a16ca2d669f6b603835a05ba",
    "id": null,
    "metadata": {},
    "name": "AppAllPostQuery",
    "operationKind": "query",
    "text": "query AppAllPostQuery {\n  allPosts {\n    id\n    user_id\n    title\n    views\n  }\n}\n"
  }
};
})();

(node as any).hash = "d303fc847eaf5642f8e16d90605eaa9a";

export default node;
