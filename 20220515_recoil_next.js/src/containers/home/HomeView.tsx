import { useRecoilState, useRecoilValue } from 'recoil';
import CharacterCount from 'components/home/CharacterCount';
import TextInput from 'components/home/TextInput';
import { textState, charCountState } from 'modules/text/recoilModule';

export default function HomeView() {
  const [text, setText] = useRecoilState(textState);
  const count = useRecoilValue(charCountState);
  return (
    <>
      <TextInput onChange={setText} text={text.value} />
      <CharacterCount count={count} />
    </>
  );
}
