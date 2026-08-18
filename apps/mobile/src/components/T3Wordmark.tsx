import type { ColorValue } from "react-native";
import Svg, { Text as SvgText } from "react-native-svg";

/**
 * The Pulse brand mark. The legacy export name is retained because it is an
 * internal compatibility seam for native bundles and downstream imports.
 */
export function T3Wordmark(props: { readonly height: number; readonly color: ColorValue }) {
  const aspectRatio = 2.7;
  return (
    <Svg
      accessibilityLabel="Pulse"
      height={props.height}
      width={props.height * aspectRatio}
      viewBox="0 0 108 40"
    >
      <SvgText
        fill={props.color}
        fontFamily="DMSans-Medium"
        fontSize="40"
        fontWeight="600"
        letterSpacing="-1"
        x="0"
        y="33"
      >
        Pulse
      </SvgText>
    </Svg>
  );
}
