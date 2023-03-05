import { PreloadedQuery, usePreloadedQuery } from "react-relay";
import { StarComponent } from "./StarComponent";
import { type RepositoryQuery as RepositoryQueryType } from "./__generated__/RepositoryQuery.graphql";
import { RepositoryQuery } from "./SingleRepository";

export function Repository({
  queryRef,
}: {
  queryRef: PreloadedQuery<RepositoryQueryType>;
}) {
  const data = usePreloadedQuery<RepositoryQueryType>(
    RepositoryQuery,
    queryRef
  );

  return (
    <>
      <p>isPrivate: {`${data.repository?.isPrivate}`}</p>
      <p>nameWithOwner: {data.repository?.nameWithOwner}</p>
      {data.repository && <StarComponent repository={data.repository} />}
    </>
  );
}
