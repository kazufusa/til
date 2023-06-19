/**
 * @generated SignedSource<<012106e6e88dba298b1ae522cce2e1c2>>
 * @lightSyntaxTransform
 * @nogrep
 */

/* tslint:disable */
/* eslint-disable */
// @ts-nocheck

import { ConcreteRequest, Query } from 'relay-runtime';
import { FragmentRefs } from "relay-runtime";
export type FormQuery$variables = {
  noQuery?: boolean | null;
  query: string;
};
export type FormQuery$data = {
  readonly search?: {
    readonly " $fragmentSpreads": FragmentRefs<"RepositoriesFragment">;
  };
  readonly " $fragmentSpreads": FragmentRefs<"RepositoryFragment">;
};
export type FormQuery = {
  response: FormQuery$data;
  variables: FormQuery$variables;
};

const node: ConcreteRequest = (function(){
var v0 = {
  "defaultValue": true,
  "kind": "LocalArgument",
  "name": "noQuery"
},
v1 = {
  "defaultValue": null,
  "kind": "LocalArgument",
  "name": "query"
},
v2 = [
  {
    "kind": "Literal",
    "name": "first",
    "value": 10
  },
  {
    "kind": "Variable",
    "name": "query",
    "variableName": "query"
  },
  {
    "kind": "Literal",
    "name": "type",
    "value": "REPOSITORY"
  }
],
v3 = {
  "alias": null,
  "args": null,
  "kind": "ScalarField",
  "name": "__typename",
  "storageKey": null
},
v4 = {
  "alias": null,
  "args": null,
  "kind": "ScalarField",
  "name": "id",
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
    "name": "FormQuery",
    "selections": [
      {
        "condition": "noQuery",
        "kind": "Condition",
        "passingValue": false,
        "selections": [
          {
            "alias": null,
            "args": (v2/*: any*/),
            "concreteType": "SearchResultItemConnection",
            "kind": "LinkedField",
            "name": "search",
            "plural": false,
            "selections": [
              {
                "args": null,
                "kind": "FragmentSpread",
                "name": "RepositoriesFragment"
              }
            ],
            "storageKey": null
          }
        ]
      },
      {
        "args": null,
        "kind": "FragmentSpread",
        "name": "RepositoryFragment"
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
    "name": "FormQuery",
    "selections": [
      {
        "condition": "noQuery",
        "kind": "Condition",
        "passingValue": false,
        "selections": [
          {
            "alias": null,
            "args": (v2/*: any*/),
            "concreteType": "SearchResultItemConnection",
            "kind": "LinkedField",
            "name": "search",
            "plural": false,
            "selections": [
              {
                "alias": null,
                "args": null,
                "concreteType": null,
                "kind": "LinkedField",
                "name": "nodes",
                "plural": true,
                "selections": [
                  (v3/*: any*/),
                  {
                    "kind": "InlineFragment",
                    "selections": [
                      {
                        "alias": null,
                        "args": null,
                        "kind": "ScalarField",
                        "name": "name",
                        "storageKey": null
                      },
                      {
                        "alias": null,
                        "args": null,
                        "concreteType": null,
                        "kind": "LinkedField",
                        "name": "owner",
                        "plural": false,
                        "selections": [
                          (v3/*: any*/),
                          {
                            "alias": null,
                            "args": null,
                            "kind": "ScalarField",
                            "name": "login",
                            "storageKey": null
                          },
                          (v4/*: any*/)
                        ],
                        "storageKey": null
                      },
                      {
                        "alias": null,
                        "args": null,
                        "kind": "ScalarField",
                        "name": "nameWithOwner",
                        "storageKey": null
                      }
                    ],
                    "type": "Repository",
                    "abstractKey": null
                  },
                  {
                    "kind": "InlineFragment",
                    "selections": [
                      (v4/*: any*/)
                    ],
                    "type": "Node",
                    "abstractKey": "__isNode"
                  }
                ],
                "storageKey": null
              }
            ],
            "storageKey": null
          }
        ]
      }
    ]
  },
  "params": {
    "cacheID": "f0aa5752b8b9ec84cf5bac44e10359bb",
    "id": null,
    "metadata": {},
    "name": "FormQuery",
    "operationKind": "query",
    "text": "query FormQuery(\n  $query: String!\n  $noQuery: Boolean = true\n) {\n  search(query: $query, type: REPOSITORY, first: 10) @skip(if: $noQuery) {\n    ...RepositoriesFragment\n  }\n}\n\nfragment RepositoriesFragment on SearchResultItemConnection {\n  nodes {\n    __typename\n    ... on Repository {\n      name\n      owner {\n        __typename\n        login\n        id\n      }\n      nameWithOwner\n    }\n    ... on Node {\n      __isNode: __typename\n      id\n    }\n  }\n}\n"
  }
};
})();

(node as any).hash = "d3381bea0d1570041c3360c1567cf43f";

export default node;
