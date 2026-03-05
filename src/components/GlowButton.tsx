import { motion } from "framer-motion";

type Props = {
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
  className?: string;
};

export function GlowButton({ onClick, disabled, children, className }: Props) {
  return (
    <motion.button
      type="button"
      onClick={onClick}
      disabled={disabled}
      whileTap={{ scale: disabled ? 1 : 0.985 }}
      whileHover={{ scale: disabled ? 1 : 1.01 }}
      className={["glowBtn", className].filter(Boolean).join(" ")}
    >
      <span className="glowBtnInner">{children}</span>
    </motion.button>
  );
}
