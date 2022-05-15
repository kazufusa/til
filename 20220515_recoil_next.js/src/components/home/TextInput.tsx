import Text from "models/Text";
interface Props {
  text: string,
  onChange: (text: Text) => void,
}

export default function TextInput({ onChange, text }: Props) {
  return (
    <div>
      <input
        type="text"
        value={text}
        onChange={e => onChange(new Text(e.currentTarget.value))}
      />
      <br />
      Echo: {text}
    </div>
  );
}
