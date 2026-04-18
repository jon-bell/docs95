import React from 'react';

export interface MarkerData {
  readonly text: string;
  readonly widthPx: number;
}

export interface ListMarkerProps {
  readonly marker: MarkerData;
}

/**
 * Renders a list bullet or number marker before the line's run content.
 * Positioned as an inline-block so the runs follow it naturally within the line.
 * user-select: none prevents the marker from being included in text selections.
 */
export const ListMarker: React.FC<ListMarkerProps> = ({ marker }) => {
  return (
    <span className="list-marker" aria-hidden="true" style={{ width: marker.widthPx }}>
      {marker.text}
    </span>
  );
};
