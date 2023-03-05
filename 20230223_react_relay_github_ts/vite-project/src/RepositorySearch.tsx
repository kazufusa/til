import React from "react";
import { PreloadedQuery, usePreloadedQuery, useQueryLoader } from "react-relay";
import { StarComponent } from "./StarComponent";
import { type RepositoryQuery as RepositoryQueryType } from "./__generated__/RepositoryQuery.graphql";
import { Suspense } from "react";
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

export function RepositorySearch() {
  const [queryRef, loadQuery] =
    useQueryLoader<RepositoryQueryType>(RepositoryQuery);
  const [owner, setOwner] = React.useState<string>("facebook");
  const [name, setName] = React.useState<string>("relay");

  const refetch = React.useCallback(() => {
    loadQuery({ owner, name });
  }, [loadQuery, owner, name]);

  return (
    <>
      <h2>Relay and Input</h2>
      <Suspense fallback={<p>Loading...</p>}>
        <form action="javascript:void(0);">
          <input
            type="text"
            value={owner}
            onChange={(v) => setOwner(v.target.value)}
          />
          <input
            type="text"
            value={name}
            onChange={(v) => setName(v.target.value)}
          />
          <button onClick={refetch}> 表示 </button>
        </form>
        {queryRef && <Repository queryRef={queryRef} />}
      </Suspense>
    </>
  );
}
