import type { SVGProps } from "react";

type IconProps=SVGProps<SVGSVGElement>;
const base={width:18,height:18,viewBox:"0 0 24 24",fill:"none",stroke:"currentColor",strokeWidth:1.8,strokeLinecap:"round" as const,strokeLinejoin:"round" as const,"aria-hidden":true};
export const MenuIcon=(props:IconProps)=><svg {...base} {...props}><path d="M4 7h16M4 12h16M4 17h16"/></svg>;
export const CloseIcon=(props:IconProps)=><svg {...base} {...props}><path d="m6 6 12 12M18 6 6 18"/></svg>;
export const SearchIcon=(props:IconProps)=><svg {...base} {...props}><circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/></svg>;
export const CartIcon=(props:IconProps)=><svg {...base} {...props}><path d="M3 4h2l2.2 10.2a2 2 0 0 0 2 1.6h7.9a2 2 0 0 0 2-1.6L20.5 8H6"/><circle cx="10" cy="20" r="1"/><circle cx="18" cy="20" r="1"/></svg>;
export const SaleIcon=(props:IconProps)=><svg {...base} {...props}><path d="M5 4h14v16H5zM8 8h8M8 12h5"/></svg>;
export const BoxIcon=(props:IconProps)=><svg {...base} {...props}><path d="m4 7 8-4 8 4-8 4-8-4Z"/><path d="m4 7 8 4 8-4v10l-8 4-8-4Z"/><path d="M12 11v10"/></svg>;
export const ChartIcon=(props:IconProps)=><svg {...base} {...props}><path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/></svg>;
export const UsersIcon=(props:IconProps)=><svg {...base} {...props}><circle cx="9" cy="8" r="3"/><path d="M3 20c0-4 2-6 6-6s6 2 6 6M16 5a3 3 0 0 1 0 6M17 14c3 .5 4 2.5 4 6"/></svg>;

export const HomeIcon=(props:IconProps)=><svg {...base} {...props}><path d="m3 10 9-7 9 7v10H3z"/><path d="M9 20v-7h6v7"/></svg>;
export const EyeIcon=(props:IconProps)=><svg {...base} {...props}><path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6Z"/><circle cx="12" cy="12" r="2.5"/></svg>;
export const PencilIcon=(props:IconProps)=><svg {...base} {...props}><path d="m4 20 4.5-1 10-10a2.1 2.1 0 0 0-3-3l-10 10L4 20Z"/><path d="m13.5 8 3 3"/></svg>;
