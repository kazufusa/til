import { graphql, loadQuery } from "react-relay";
import { relayEnv } from "./relayEnv";
import { Repository } from "./Repository";
import { type SingleRepositoryQuery as QueryType } from "./__generated__/SingleRepositoryQuery.graphql";

export const SingleRepositoryQuery = graphql`
  query SingleRepositoryQuery($owner: String!, $name: String!) {
    repository(owner: $owner, name: $name) {
      isPrivate
      nameWithOwner
      ...StarComponent_star
    }
  }
`;

const preloadedQuery = loadQuery<QueryType>(
  relayEnv,
  SingleRepositoryQuery,
  {
    owner: "facebook",
    name: "relay",
  }
);

export function SingleRepository() {
  return (
    <>
      <h2>
        Basic <code>usePreloadedQuery</code>
      </h2>
      <Repository queryRef={preloadedQuery} />
    </>
  );
}
