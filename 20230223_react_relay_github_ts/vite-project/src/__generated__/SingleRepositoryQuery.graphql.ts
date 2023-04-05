/**
 * @generated SignedSource<<81c6cf76a45bf755710fc890c784cf51>>
 * @lightSyntaxTransform
 * @nogrep
 */

/* tslint:disable */
/* eslint-disable */
// @ts-nocheck

import { ConcreteRequest, Query } from 'relay-runtime';
import { FragmentRefs } from "relay-runtime";
export type SingleRepositoryQuery$variables = {
  name: string;
  owner: string;
};
export type SingleRepositoryQuery$data = {
  readonly repository: {
    readonly isPrivate: boolean;
    readonly nameWithOwner: string;
    readonly " $fragmentSpreads": FragmentRefs<"StarComponent_star">;
  } | null;
};
export type SingleRepositoryQuery = {
  response: SingleRepositoryQuery$data;
  variables: SingleRepositoryQuery$variables;
};

const node: ConcreteRequest = (function(){
var v0 = {
  "defaultValue": null,
  "kind": "LocalArgument",
  "name": "name"
},
v1 = {
  "defaultValue": null,
  "kind": "LocalArgument",
  "name": "owner"
},
v2 = [
  {
    "kind": "Variable",
    "name": "name",
    "variableName": "name"
  },
  {
    "kind": "Variable",
    "name": "owner",
    "variableName": "owner"
  }
],
v3 = {
  "alias": null,
  "args": null,
  "kind": "ScalarField",
  "name": "isPrivate",
  "storageKey": null
},
v4 = {
  "alias": null,
  "args": null,
  "kind": "ScalarField",
  "name": "nameWithOwner",
  "storageKey": null
};
return {
  "fragment": {
    "argumentDefinitions": [
      (v0/*: any*/),
      (v1/*: any*/)
    ],
    "kind": "Fragment",
    "metadata": null,
    "name": "SingleRepositoryQuery",
    "selections": [
      {
        "alias": null,
        "args": (v2/*: any*/),
        "concreteType": "Repository",
        "kind": "LinkedField",
        "name": "repository",
        "plural": false,
        "selections": [
          (v3/*: any*/),
          (v4/*: any*/),
          {
            "args": null,
            "kind": "FragmentSpread",
            "name": "StarComponent_star"
          }
        ],
        "storageKey": null
      }
    ],
    "type": "Query",
    "abstractKey": null
  },
  "kind": "Request",
  "operation": {
    "argumentDefinitions": [
      (v1/*: any*/),
      (v0/*: any*/)
    ],
    "kind": "Operation",
    "name": "SingleRepositoryQuery",
    "selections": [
      {
        "alias": null,
        "args": (v2/*: any*/),
        "concreteType": "Repository",
        "kind": "LinkedField",
        "name": "repository",
        "plural": false,
        "selections": [
          (v3/*: any*/),
          (v4/*: any*/),
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
            "name": "viewerHasStarred",
            "storageKey": null
          },
          {
            "alias": null,
            "args": null,
            "concreteType": "StargazerConnection",
            "kind": "LinkedField",
            "name": "stargazers",
            "plural": false,
            "selections": [
              {
                "alias": null,
                "args": null,
                "kind": "ScalarField",
                "name": "totalCount",
                "storageKey": null
              }
            ],
            "storageKey": null
          }
        ],
        "storageKey": null
      }
    ]
  },
  "params": {
    "cacheID": "104939d304bb8543cd693a3207515921",
    "id": null,
    "metadata": {},
    "name": "SingleRepositoryQuery",
    "operationKind": "query",
    "text": "query SingleRepositoryQuery(\n  $owner: String!\n  $name: String!\n) {\n  repository(owner: $owner, name: $name) {\n    isPrivate\n    nameWithOwner\n    ...StarComponent_star\n    id\n  }\n}\n\nfragment StarComponent_star on Repository {\n  id\n  viewerHasStarred\n  stargazers {\n    totalCount\n  }\n}\n"
  }
};
})();

(node as any).hash = "9e4e3e68cc4979360a44e21ee22aeb82";

export default node;
