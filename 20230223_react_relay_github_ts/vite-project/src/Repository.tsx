import { graphql, loadQuery, usePreloadedQuery } from "react-relay";
import { relayEnv } from "./relayEnv";
import { StarComponent } from "./StarComponent";
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

export function Repository() {
  const data = usePreloadedQuery(RepositoryQuery, preloadedQuery);
  return (
    <>
      <h2>
        Basic <code>usePreloadedQuery</code>
      </h2>
      <p>isPrivate: {`${data.repository?.isPrivate}`}</p>
      <p>nameWithOwner: {data.repository?.nameWithOwner}</p>
      {data.repository && <StarComponent repository={data.repository} />}
    </>
  );
}
