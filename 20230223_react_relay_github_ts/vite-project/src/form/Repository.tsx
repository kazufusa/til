import { useFragment, useRefetchableFragment } from "react-relay";
import { graphql } from "relay-runtime";
import { RepositoryFragment$key } from "./__generated__/RepositoryFragment.graphql";
import { useEffect, useTransition } from "react";
import {
  FormControl,
  InputLabel,
  MenuItem,
  Select,
  SelectChangeEvent,
} from "@mui/material";

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
  setUserName: (login: string) => void;
}

export default function Repository({ query, name, owner, setUserName }: Props) {
  const [data, refetch] = useRefetchableFragment(RepositoriesFragment, query);
  const [isPending, startTransition] = useTransition();
  useEffect(() => {
    startTransition(() => {
      refetch({ name, owner, skip: name === null || owner === null });
    });
  }, [name, owner, refetch]);
  const names =
    data?.repository?.assignableUsers?.nodes?.flatMap((v) => v?.name ?? []) ||
    [];
  return (
    <div>
      {isPending ? (
        <div>Loading</div>
      ) : (
        <Names
          names={names}
          onChangeHandler={(name: string) => setUserName(name)}
        />
      )}
    </div>
  );
}

function Names({
  names,
  onChangeHandler,
}: {
  names: string[];
  onChangeHandler: (login: string) => void;
}) {
  function onChange(event: SelectChangeEvent) {
    const login: string = event.target.value;
    onChangeHandler(login);
  }

  return (
    <FormControl disabled={names.length === 0}>
      <InputLabel id="demo-simple-select-label">Login</InputLabel>
      <Select
        sx={{ width: "300px" }}
        variant="standard"
        labelId="demo-simple-select-label"
        id="demo-simple-select"
        label="Login"
        onChange={onChange}
      >
        {names.map((v, i) => (
          <MenuItem key={`${i}`} value={v}>
            {" "}
            {v}{" "}
          </MenuItem>
        ))}
      </Select>
    </FormControl>
  );
}
