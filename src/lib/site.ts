import type { LucideIcon } from "lucide-react";
import {
  Blocks,
  BookOpenText,
  BookUser,
  BriefcaseBusiness,
  Building2,
  LayoutDashboard,
  PanelsTopLeft,
  Stethoscope,
} from "lucide-react";

export type NavItem = {
  href: string;
  label: string;
};

export type SiteFeature = {
  title: string;
  description: string;
  icon: LucideIcon;
};

export const mainNav: NavItem[] = [
  { href: "#services", label: "Services" },
  { href: "#components", label: "Components" },
  { href: "#process", label: "Process" },
  { href: "/docs", label: "Docs" },
];

export const ftccMainNav: NavItem[] = [
  { href: "#services", label: "Services" },
  { href: "#solutions", label: "Solutions" },
  { href: "#facilities", label: "Facilities" },
  // { href: "#about", label: "About" },
  { href: "#articles", label: "Articles" },
  { href: "#contact", label: "Contact" },
];

export const capabilities: SiteFeature[] = [
  {
    title: "Seamless Patient Journey",
    description:
      "Deliver a complete, end-to-end patient experience—from registration and consultation to treatment and follow-up care.",
    icon: BookUser,
  },
  {
    title: "Medical Missions & Outreach",
    description:
      "Efficiently manage and deploy medical caravans and outreach programs to serve communities anytime, anywhere.",
    icon: Stethoscope,
  },
  {
    title: "Integrated EMR System",
    description:
      "Centralize patient records with a secure and scalable Electronic Medical Records system for better care coordination.",
    icon: LayoutDashboard,
  },
  {
    title: "Nationwide Facility Expansion",
    description:
      "Support the growth and management of healthcare facilities across multiple locations nationwide.",
    icon: Building2,
  },
];

export const siteStats = [
  {
    value: "Expert Medical Team",
    label: "Skilled Professionals",
    description:
      "Our experienced doctors and healthcare professionals are committed to delivering high-quality patient care.",
  },
  {
    value: "Modern Facilities",
    label: "Advanced Infrastructure",
    description:
      "Equipped with state-of-the-art technology and designed for comfort, our facilities support efficient and reliable healthcare services.",
  },
  {
    value: "Comprehensive Care",
    label: "Full-Service Healthcare",
    description:
      "From preventive services to specialized treatments, we provide complete care tailored to every patient’s needs.",
  },
];

export const facilities = [
  {
    id: 1,
    name: "FTCC Medical Clinic - Mandaluyog (Main Clinic)",
    address:
      "Global Link Center Shaw Blvd. Wack Wack Greenhills, Mandaluyog City, Metro Manila",
    status: "Active",
  },
  {
    id: 2,
    name: "FTCC Medical Clinic - North Caloocan ",
    address: "",
    status: "Not Yet Started",
  },
  {
    id: 3,
    name: "FTCC Medical Clinic - South Caloocan ",
    address: "",
    status: "Not Yet Started",
  },
  {
    id: 4,
    name: "FTCC Medical Clinic - Makati ",
    address: "",
    status: "Not Yet Started",
  },
  {
    id: 5,
    name: "FTCC Medical Clinic - Albay ",
    address: "",
    status: "Not Yet Started",
  },
  {
    id: 6,
    name: "FTCC Medical Clinic - Camarines Sur",
    address: "",
    status: "Not Yet Started",
  },
  {
    id: 7,
    name: "FTCC Medical Clinic - Cabanatuan",
    address: "",
    status: "Not Yet Started",
  },
  {
    id: 8,
    name: "FTCC Medical Clinic - Surigao",
    address: "",
    status: "Not Yet Started",
  },
  {
    id: 9,
    name: "FTCC Medical Clinic - Pampanga",
    address: "",
    status: "Not Yet Started",
  },
  {
    id: 10,
    name: "FTCC Medical Clinic - Bulacan",
    address: "",
    status: "Not Yet Started",
  },
  {
    id: 11,
    name: "FTCC Medical Clinic - Quezon City",
    address: "",
    status: "Not Yet Started",
  },
  {
    id: 12,
    name: "FTCC Medical Clinic - Pasig",
    address: "",
    status: "Not Yet Started",
  },
];
