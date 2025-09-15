import React from "react";

export default function ScoreInput({ value = { home: 0, away: 0 }, onChange }) {
  const setVal = (side, delta) =>
    onChange?.({
      ...value,
      [side]: Math.max(0, (value[side] || 0) + delta),
    });

  return (
    <div className="flex items-center justify-center gap-3" role="group" aria-label="Εισαγωγή σκορ">
      <Stepper
        n={value.home || 0}
        onMinus={() => setVal("home", -1)}
        onPlus={() => setVal("home", +1)}
      />
      <div className="px-2 text-xl font-bold">–</div>
      <Stepper
        n={value.away || 0}
        onMinus={() => setVal("away", -1)}
        onPlus={() => setVal("away", +1)}
      />
    </div>
  );
}

function Stepper({ n, onMinus, onPlus }) {
  const blockMouseDown = (e) => e.preventDefault();

  const handleMinus = (e) => {
    e.preventDefault();
    e.stopPropagation();
    onMinus?.();
  };
  const handlePlus = (e) => {
    e.preventDefault();
    e.stopPropagation();
    onPlus?.();
  };

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        className="btn btn-neutral"
        onMouseDown={blockMouseDown}
        onClick={handleMinus}
      >
        −
      </button>
      <div
        className="pill text-white text-xl px-5 py-2"
        style={{ background: "linear-gradient(90deg,#BA1ED3,#F11467)" }}
      >
        {n}
      </div>
      <button
        type="button"
        className="btn btn-neutral"
        onMouseDown={blockMouseDown}
        onClick={handlePlus}
      >
        +
      </button>
    </div>
  );
}
