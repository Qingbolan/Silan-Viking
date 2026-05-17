import React from 'react';
import { motion } from 'framer-motion';

interface SkillsCloudProps {
  skills: string[];
}

// A skill line may be a flat skill ("PyTorch") or a grouped line
// ("Languages: Python, Go, Rust"). Split grouped lines into a labelled
// cluster so the cloud reads as an organised index, not a random pile.
const parseSkill = (line: string): { label?: string; items: string[] } => {
  const grouped = line.match(/^\s*([^:：]+)[:：]\s*(.+)$/);
  if (grouped) {
    const items = grouped[2]
      .split(/[,，、;；]/)
      .map((s) => s.trim())
      .filter(Boolean);
    return { label: grouped[1].trim(), items };
  }
  return { items: [line.trim()] };
};

// Borderless skill cloud: chips are tinted surface fills, no stroke.
// Grouped lines render as a labelled row; flat lines fold into one cluster.
const SkillsCloud: React.FC<SkillsCloudProps> = ({ skills }) => {
  const groups = skills.map(parseSkill);
  const hasLabels = groups.some((g) => g.label);

  // No grouping in the data → render a single flat cloud of chips.
  if (!hasLabels) {
    const all = groups.flatMap((g) => g.items);
    return (
      <div className="flex flex-wrap gap-2">
        {all.map((item, index) => (
          <motion.span
            key={index}
            className="inline-flex items-center rounded-md bg-theme-surface px-2.5 py-1 text-sm text-theme-secondary transition-colors duration-200 hover:bg-theme-primary-light hover:text-theme-accent"
            initial={{ opacity: 0, scale: 0.94 }}
            whileInView={{ opacity: 1, scale: 1 }}
            viewport={{ once: true, amount: 0.3 }}
            transition={{ duration: 0.25, delay: index * 0.03 }}
          >
            {item}
          </motion.span>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {groups.map((group, gIndex) => (
        <motion.div
          key={gIndex}
          className="flex flex-col gap-2 sm:flex-row sm:items-baseline sm:gap-4"
          initial={{ opacity: 0, y: 8 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.3 }}
          transition={{ duration: 0.35, delay: gIndex * 0.06 }}
        >
          {group.label && (
            <span className="flex-shrink-0 font-mono text-[0.7rem] font-medium uppercase tracking-wider text-theme-tertiary sm:w-32 sm:text-right">
              {group.label}
            </span>
          )}
          <div className="flex flex-wrap gap-2">
            {group.items.map((item, iIndex) => (
              <span
                key={iIndex}
                className="inline-flex items-center rounded-md bg-theme-surface px-2.5 py-1 text-sm text-theme-secondary transition-colors duration-200 hover:bg-theme-primary-light hover:text-theme-accent"
              >
                {item}
              </span>
            ))}
          </div>
        </motion.div>
      ))}
    </div>
  );
};

export default SkillsCloud;
