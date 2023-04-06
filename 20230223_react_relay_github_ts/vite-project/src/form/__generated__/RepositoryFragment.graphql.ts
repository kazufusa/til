/**
 * @generated SignedSource<<e540a2383b322dde13b40a28cc760237>>
 * @lightSyntaxTransform
 * @nogrep
 */

/* tslint:disable */
/* eslint-disable */
// @ts-nocheck

import { ReaderFragment, RefetchableFragment } from 'relay-runtime';
import { FragmentRefs } from "relay-runtime";
export type RepositoryFragment$data = {
  readonly repository?: {
    readonly assignableUsers: {
      readonly nodes: ReadonlyArray<{
        readonly name: string | null;
      } | null> | null;
    };
  } | null;
  readonly " $fragmentType": "RepositoryFragment";
};
export type RepositoryFragment$key = {
  readonly " $data"?: RepositoryFragment$data;
  readonly " $fragmentSpreads": FragmentRefs<"RepositoryFragment">;
};

import RepositoryRefetchQuery_graphql from './RepositoryRefetchQuery.graphql';

const node: ReaderFragment = {
  "argumentDefinitions": [
    {
      "defaultValue": "",
      "kind": "LocalArgument",
      "name": "name"
    },
    {
      "defaultValue": "",
      "kind": "LocalArgument",
      "name": "owner"
    },
    {
      "defaultValue": true,
      "kind": "LocalArgument",
      "name": "skip"
    }
  ],
  "kind": "Fragment",
  "metadata": {
    "refetch": {
      "connection": null,
      "fragmentPathInResult": [],
      "operation": RepositoryRefetchQuery_graphql
    }
  },
  "name": "RepositoryFragment",
  "selections": [
    {
      "condition": "skip",
      "kind": "Condition",
      "passingValue": false,
      "selections": [
        {
          "alias": null,
          "args": [
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
          "concreteType": "Repository",
          "kind": "LinkedField",
          "name": "repository",
          "plural": false,
          "selections": [
            {
              "alias": null,
              "args": [
                {
                  "kind": "Literal",
                  "name": "first",
                  "value": 30
                }
              ],
              "concreteType": "UserConnection",
              "kind": "LinkedField",
              "name": "assignableUsers",
              "plural": false,
              "selections": [
                {
                  "alias": null,
                  "args": null,
                  "concreteType": "User",
                  "kind": "LinkedField",
                  "name": "nodes",
                  "plural": true,
                  "selections": [
                    {
                      "alias": null,
                      "args": null,
                      "kind": "ScalarField",
                      "name": "name",
                      "storageKey": null
                    }
                  ],
                  "storageKey": null
                }
              ],
              "storageKey": "assignableUsers(first:30)"
            }
          ],
          "storageKey": null
        }
      ]
    }
  ],
  "type": "Query",
  "abstractKey": null
};

(node as any).hash = "ed999f4431f76067288031fd7b32e415";

export default node;
