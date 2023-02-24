/**
 * @generated SignedSource<<8e4f5ea538aca4dfd6dddfd3bc1676c2>>
 * @lightSyntaxTransform
 * @nogrep
 */

/* tslint:disable */
/* eslint-disable */
// @ts-nocheck

import { Fragment, ReaderFragment } from 'relay-runtime';
import { FragmentRefs } from "relay-runtime";
export type StarComponent_star$data = {
  readonly id: string;
  readonly stargazers: {
    readonly totalCount: number;
  };
  readonly viewerHasStarred: boolean;
  readonly " $fragmentType": "StarComponent_star";
};
export type StarComponent_star$key = {
  readonly " $data"?: StarComponent_star$data;
  readonly " $fragmentSpreads": FragmentRefs<"StarComponent_star">;
};

const node: ReaderFragment = {
  "argumentDefinitions": [],
  "kind": "Fragment",
  "metadata": null,
  "name": "StarComponent_star",
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
  "type": "Repository",
  "abstractKey": null
};

(node as any).hash = "6000c852ee3f662995756877197a5bc3";

export default node;
