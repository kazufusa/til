import { atom, selector } from 'recoil';
import Text from 'models/Text';

export const textState = atom({
  key: 'textState',
  default: new Text(''),
});

export const charCountState = selector({
  key: 'charCountState',
  get: ({ get }) => {
    const text: Text = get(textState);
    return text.length;
  },
});
