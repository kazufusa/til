import { FormControl, InputLabel, MenuItem, Select, SelectChangeEvent } from "@mui/material";
import { useFragment } from "react-relay";
import { graphql } from "relay-runtime";
import { type RepositoriesFragment$key } from "./__generated__/RepositoriesFragment.graphql";

const RepositoriesFragment = graphql`
  fragment RepositoriesFragment on SearchResultItemConnection {
    nodes {
      ... on Repository {
        name
        owner {
          id
        }
        nameWithOwner
      }
    }
  }
`;

interface Props {
  query: RepositoriesFragment$key;
}

export function Repositories({ query }: Props) {
  const data = useFragment<RepositoriesFragment$key>(
    RepositoriesFragment,
    query
  );

  function onChange(event: SelectChangeEvent) {
    const nameWithOwner: string = event.target.value;
    console.log(nameWithOwner)
  };

  return (
    <FormControl>
      <InputLabel id="demo-simple-select-label">Repository</InputLabel>
      <Select
        sx={{ width: "300px" }}
        variant="standard"
        labelId="demo-simple-select-label"
        id="demo-simple-select"
        label="Age"
        onChange={onChange}
      >
        {data.nodes?.map((v, i) =>
          v &&
          <MenuItem key={`${i}`} value={v.nameWithOwner}>{v.nameWithOwner}</MenuItem>
        )}
      </Select>
    </FormControl>
  )
}
