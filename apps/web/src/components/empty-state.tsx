"use client";

import { LucideIcon } from "lucide-react";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
  actionHref?: string;
  className?: string;
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  actionLabel,
  onAction,
  className = "",
}: EmptyStateProps) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.96 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.4, ease: "easeOut" }}
      className={`flex flex-col items-center justify-center rounded-2xl border border-dashed border-border/70 bg-muted/15 px-6 py-12 text-center backdrop-blur-xs ${className}`}
    >
      <div className="flex size-14 items-center justify-center rounded-2xl bg-primary/10 text-primary shadow-sm shadow-primary/10">
        <Icon className="size-7" aria-hidden="true" />
      </div>
      <h3 className="mt-5 text-base font-semibold tracking-tight text-foreground">{title}</h3>
      <p className="mt-2 max-w-sm text-sm text-muted-foreground leading-relaxed">{description}</p>
      {actionLabel && onAction && (
        <div className="mt-6">
          <Button size="sm" onClick={onAction} className="shadow-sm shadow-primary/20">
            {actionLabel}
          </Button>
        </div>
      )}
    </motion.div>
  );
}
