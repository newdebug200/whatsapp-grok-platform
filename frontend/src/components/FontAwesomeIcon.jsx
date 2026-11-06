import React from 'react';

export default function FontAwesomeIcon({ icon, ...props }) {
  const [width, height, , , pathData] = icon.icon;

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      fill="currentColor"
      focusable="false"
      {...props}
    >
      <path d={pathData} />
    </svg>
  );
}
