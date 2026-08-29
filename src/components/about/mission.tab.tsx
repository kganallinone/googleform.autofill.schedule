// components/MissionTabs.tsx
"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { CheckCircle, Target, Eye, Heart } from "lucide-react";

interface Tab {
  id: string;
  label: string;
  icon: React.ElementType;
}

const tabs: Tab[] = [
  { id: "mission", label: "Our Mission", icon: Target },
  { id: "vision", label: "Our Vision", icon: Eye },
  { id: "values", label: "Core Values", icon: Heart },
];

const content = {
  mission: (
    <div className="space-y-4">
      <p className="text-lg text-gray-700 mb-6">
        FTCC (Filipino Trusted Care) translates the vision of the Universal
        Health Care (UHC) Act into action by operating compliant,
        technology-driven Konsulta networks that:
      </p>
      <ul className="space-y-4">
        {[
          "Enable LGUs to meet Konsulta targets without new capital outlay",
          "Operate private-sector clinics to serve the large underserved and mobile populations",
          "Seamlessly integrate pharmacy, laboratory (fixed and mobile), telemedicine, and digital registration across care pathways",
          "Maintain strict compliance with RA 11223 (UHC Act), PhilHealth Circulars 2023-0008 & 2024-0013, and DOH licensing regulations",
        ].map((item, idx) => (
          <li key={idx} className="flex items-start gap-3">
            <CheckCircle className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
            <span className="text-gray-700">{item}</span>
          </li>
        ))}
      </ul>
    </div>
  ),
  vision: (
    <div className="text-center py-12">
      <div className="inline-flex p-3 bg-blue-100 rounded-full mb-6">
        <Eye className="w-8 h-8 text-blue-600" />
      </div>
      <p className="text-gray-700 text-xl md:text-2xl leading-relaxed font-light max-w-3xl mx-auto">
        "Universal primary care that every Filipino can truly trust —
        <span className="font-semibold text-blue-600">
          {" "}
          accessible, tech-enabled, and financially sustainable
        </span>
        ."
      </p>
    </div>
  ),
  values: (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
      {[
        {
          name: "Integrity",
          desc: "Maintaining the highest standards of honesty and ethical conduct",
          icon: Heart,
        },
        {
          name: "Innovation",
          desc: "Continuously improving and embracing new technologies",
          icon: Target,
        },
        {
          name: "Inclusivity",
          desc: "Ensuring healthcare is accessible to all Filipinos",
          icon: Heart,
        },
        {
          name: "Compliance",
          desc: "Adhering to all healthcare regulations and standards",
          icon: CheckCircle,
        },
        {
          name: "Service Excellence",
          desc: "Delivering exceptional care and service to our patients",
          icon: Heart,
        },
        {
          name: "Compassion",
          desc: "Treating every patient with empathy, dignity, and respect",
          icon: Heart,
        },
      ].map((value, idx) => (
        <motion.div
          key={idx}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: idx * 0.1 }}
          className="group bg-white p-6 rounded-xl border border-gray-200 hover:border-blue-300 hover:shadow-lg transition-all duration-300"
        >
          <div className="inline-flex p-2 bg-blue-100 rounded-lg mb-4 group-hover:bg-blue-600 transition-colors">
            <value.icon className="w-5 h-5 text-blue-600 group-hover:text-white transition-colors" />
          </div>
          <h5 className="font-bold text-gray-900 mb-2">{value.name}</h5>
          <p className="text-sm text-gray-600 leading-relaxed">{value.desc}</p>
        </motion.div>
      ))}
    </div>
  ),
};

export function MissionTabs() {
  const [activeTab, setActiveTab] = useState<string>("mission");

  return (
    <div className="w-full">
      {/* Tabs Navigation */}
      <div className="flex flex-wrap justify-center gap-3 mb-10">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;

          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`relative px-6 py-3 text-sm font-medium rounded-full transition-all duration-200 flex items-center gap-2 ${
                isActive
                  ? "text-white"
                  : "text-gray-600 hover:text-gray-900 bg-gray-100 hover:bg-gray-200"
              }`}
            >
              {isActive && (
                <motion.div
                  layoutId="activeTab"
                  className="absolute inset-0 bg-blue-600 rounded-full"
                  transition={{ type: "spring", duration: 0.5 }}
                />
              )}
              <Icon
                className={`w-4 h-4 relative z-10 ${isActive ? "text-white" : "text-gray-500"}`}
              />
              <span className="relative z-10">{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* Tab Content */}
      <div className="bg-white rounded-2xl p-8 shadow-lg border border-gray-100">
        <AnimatePresence mode="wait">
          <motion.div
            key={activeTab}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            transition={{ duration: 0.2 }}
          >
            {content[activeTab as keyof typeof content]}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}
