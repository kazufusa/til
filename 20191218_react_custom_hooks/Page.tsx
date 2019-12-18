import React, { useState } from "react";

export const Page = () => {
  const topPage = 1;
  const lastPage = 4;
  const initHistory: number[] = [topPage];
  const [history, setHistory] = useState<number[]>(initHistory);

  const currentPage = history[history.length - 1];

  return (
    <div>
      <div>現在のページ: {currentPage}</div>
      <button
        onClick={() => {
          // 現在トップページの場合は移動しない
          if (currentPage !== topPage) {
            const nextHistory = [...history, topPage];
            setHistory(nextHistory);
          }
        }}
      >
        トップ
      </button>
      <button
        onClick={() => {
          const nextPage = currentPage + 1;
          // ラストページより先には進めない
          if (nextPage <= lastPage) {
            const nextHistory = [...history, nextPage];
            setHistory(nextHistory);
          }
        }}
      >
        次へ
      </button>
      <button
        onClick={() => {
          // トップページより前には戻れない
          if (history.length > 1) {
            const nextHistory = [...history.slice(0, history.length - 1)];
            setHistory(nextHistory);
          }
        }}
      >
        戻る
      </button>
      <button
        onClick={() => {
          // 現在ラストページの場合は移動しない
          if (currentPage !== lastPage) {
            const nextHistory = [...history, lastPage];
            setHistory(nextHistory);
          }
        }}
      >
        ラスト
      </button>
      <button
        onClick={() => {
          setHistory(initHistory);
        }}
      >
        履歴を消去
      </button>
    </div>
  );
};
