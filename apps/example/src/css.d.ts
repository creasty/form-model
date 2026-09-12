// Next declares the image extensions in next/image-types/global, but not stylesheets, and
// TypeScript 6 no longer lets a side-effect import of an unknown extension pass unchecked.
declare module "*.css";
