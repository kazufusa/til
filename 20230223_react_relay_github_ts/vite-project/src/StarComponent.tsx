import { graphql, useFragment } from "react-relay";
import { StarComponent_star$key } from "./__generated__/StarComponent_star.graphql";
import { AddStarButton } from "./AddStarButton";
import { RemoveStarButton } from "./RemoveStarButton";

interface Props {
  repository: StarComponent_star$key;
}

export function StarComponent({ repository }: Props) {
  const data = useFragment(
    graphql`
      fragment StarComponent_star on Repository {
        id
        viewerHasStarred
        stargazers {
          totalCount
        }
      }
    `,
    repository
  );

  return (
    <>
      <p>total star: {data.stargazers.totalCount}</p>
      <p>viewerHasStarred: {`${data.viewerHasStarred}`}</p>
      {data.viewerHasStarred && <RemoveStarButton starrableId={data.id} />}
      {data.viewerHasStarred === false && (
        <AddStarButton starrableId={data.id} />
      )}
    </>
  );
}
