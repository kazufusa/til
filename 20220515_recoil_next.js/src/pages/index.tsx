import type { NextPage } from 'next';
import Text from "models/Text";
import {
  atom,
  selector,
  useRecoilState,
  useRecoilValue,
} from 'recoil';

const textState = atom({
  key: 'textState',
  default: new Text(''),
});

const charCountState = selector({
  key: 'charCountState',
  get: ({ get }) => {
    const text = get(textState);

    return text.length;
  },
});

const Home: NextPage = () => {
  return (
    <div>
      <TextInput />
      <CharacterCount />
    </div>
  );
}

function TextInput() {
  const [text, setText] = useRecoilState(textState);

  const onChange = (event: any) => {
    setText(new Text(event.target.value));
  };

  return (
    <div>
      <input type="text" value={text.value} onChange={onChange} />
      <br />
      Echo: {text.value}
    </div>);
}

function CharacterCount() {
  const count = useRecoilValue(charCountState);

  return <>Character Count: {count}</>;
}

export default Home
