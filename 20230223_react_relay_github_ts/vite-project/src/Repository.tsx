import { graphql, loadQuery, usePreloadedQuery } from "react-relay";
import { relayEnv } from "./relayEnv";
import { StarComponent } from "./StarComponent";
import { RepositoryQuery } from "./__generated__/RepositoryQuery.graphql";

const RepositoryQuery = graphql`
  query RepositoryQuery($owner: String!, $name: String!) {
    repository(owner: $owner, name: $name) {
      isPrivate
      nameWithOwner
      ...StarComponent_star
    }
  }
`;

const preloadedQuery = loadQuery<RepositoryQuery>(relayEnv, RepositoryQuery, {
  owner: "facebook",
  name: "relay",
});

export function Repository() {
  const data = usePreloadedQuery(RepositoryQuery, preloadedQuery);
  return (
    <>
      <p>isPrivate: {`${data.repository?.isPrivate}`}</p>
      <p>nameWithOwner: {data.repository?.nameWithOwner}</p>
      {data.repository && <StarComponent repository={data.repository} />}
    </>
  );
}
