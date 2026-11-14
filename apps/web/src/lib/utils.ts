import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/** The class-name helper every shadcn component expects. */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
