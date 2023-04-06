import { useFragment, useRefetchableFragment } from "react-relay";
import { graphql } from "relay-runtime";
import { RepositoryFragment$key } from "./__generated__/RepositoryFragment.graphql";
import { useEffect, useTransition } from "react";

const RepositoriesFragment = graphql`
  fragment RepositoryFragment on Query
  @argumentDefinitions(
    name: { type: "String", defaultValue: "" }
    owner: { type: "String", defaultValue: "" }
    skip: { type: "Boolean", defaultValue: true }
  )
  @refetchable(queryName: "RepositoryRefetchQuery") {
    repository(name: $name, owner: $owner) @skip(if: $skip) {
      assignableUsers(first: 30) {
        nodes {
          name
        }
      }
    }
  }
`;

interface Props {
  query: RepositoryFragment$key;
  name: string | null;
  owner: string | null;
}

export default function Repository({ query, name, owner }: Props) {
  const [data, refetch] = useRefetchableFragment(RepositoriesFragment, query);
  const [isPending, startTransition] = useTransition();
  useEffect(() => {
    startTransition(() => {
      refetch({ name, owner, skip: name === null || owner === null });
    });
  }, [name, owner, refetch]);
  return (
    <div>
      {isPending
        ? "loading"
        : data?.repository?.assignableUsers?.nodes?.map((v) => (
            <p>{v?.name}</p>
          ))}
    </div>
  );
}
