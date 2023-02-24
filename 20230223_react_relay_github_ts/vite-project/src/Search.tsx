import { graphql, loadQuery, usePreloadedQuery } from "react-relay";
import { relayEnv } from "./relayEnv";
import { StarComponent } from "./StarComponent";
import { SearchQuery } from "./__generated__/SearchQuery.graphql";

const SearchQuery = graphql`
  query SearchQuery {
    search(query: "relay", type: REPOSITORY, first: 3) {
      nodes {
        ... on Repository {
          nameWithOwner
          ...StarComponent_star
        }
      }
    }
  }
`;

const preloadedQuery = loadQuery<SearchQuery>(relayEnv, SearchQuery, {});

export function Search() {
  const data = usePreloadedQuery(SearchQuery, preloadedQuery);
  return (
    <>
      <h2> Search Result of Relay repositories</h2>
      <ul>
        {data.search?.nodes?.map((v, i) => (
          <li key={`${i}`}>
            {v?.nameWithOwner}
            {v && <StarComponent repository={v} />}
          </li>
        ))}
      </ul>
    </>
  );
}
