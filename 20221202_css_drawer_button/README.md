# ドロワーについて学んだこと

## https://lopan.jp/css-animation/drawer/

- `pointer-events: none`するとポインタイベントが全部無効, 全画面なものでも下のものに触れる
- label(ボタン)とcheckboxが連動
- checkboxとdrawerが連動
    - drawerがチェックされるとtransformが消える
```css
#drawer:checked ~ .menu {
	transform: none;
}
```
