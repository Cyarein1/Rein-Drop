import Image from "next/image";
import { logoAssets } from "./assets";

export interface WordmarkProps {
  /** Rendered height in px; width follows the asset's aspect ratio. */
  height?: number;
  /** Use on navy/dark surfaces. */
  onDark?: boolean;
  priority?: boolean;
}

/** MVP logo: the simple Rein Drop wordmark (Brand Identity v2.1, section 5). */
export function Wordmark({ height = 32, onDark = false, priority = false }: WordmarkProps) {
  const asset = onDark ? logoAssets.wordmarkOnDark : logoAssets.wordmark;
  const width = Math.round((asset.width / asset.height) * height);
  return <Image src={asset} alt="Rein Drop" height={height} width={width} priority={priority} />;
}
