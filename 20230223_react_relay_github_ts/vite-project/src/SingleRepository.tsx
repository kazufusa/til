import { graphql, loadQuery } from "react-relay";
import { relayEnv } from "./relayEnv";
import { Repository } from "./Repository";
import { type RepositoryQuery as RepositoryQueryType } from "./__generated__/RepositoryQuery.graphql";

export const RepositoryQuery = graphql`
  query RepositoryQuery($owner: String!, $name: String!) {
    repository(owner: $owner, name: $name) {
      isPrivate
      nameWithOwner
      ...StarComponent_star
    }
  }
`;

const preloadedQuery = loadQuery<RepositoryQueryType>(
  relayEnv,
  RepositoryQuery,
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
