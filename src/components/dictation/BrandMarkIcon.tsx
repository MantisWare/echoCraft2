import { EchoCraftMark } from "../ui/EchoCraftMark";

interface BrandMarkIconProps {
  size?: number;
  className?: string;
}

/**
 * The EchoCraft mark at a fixed pixel size. Draws in `currentColor` so it
 * follows the neutral foreground treatment of the surface that contains it.
 */
export function BrandMarkIcon({ size = 24, className }: BrandMarkIconProps) {
  return <EchoCraftMark size={size} className={className} />;
}
