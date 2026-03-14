/**
 * Button 按钮组件
 *
 * 通用按钮，支持多种变体
 */
import { motion, HTMLMotionProps } from "framer-motion";
import { ReactNode } from "react";

interface ButtonProps extends Omit<HTMLMotionProps<"button">, "children"> {
    children: ReactNode;
    variant?: "primary" | "secondary" | "ghost" | "danger";
    size?: "sm" | "md" | "lg";
    loading?: boolean;
    icon?: ReactNode;
}

export const Button: React.FC<ButtonProps> = ({
    children,
    variant = "primary",
    size = "md",
    loading = false,
    icon,
    className = "",
    disabled,
    ...props
}) => {
    const baseClasses =
        "inline-flex items-center justify-center gap-2 font-medium rounded-lg transition-all";

    const variantClasses = {
        primary: "bg-blue-600 hover:bg-blue-500 text-white shadow-lg shadow-blue-500/20",
        secondary: "bg-zinc-700 hover:bg-zinc-600 text-zinc-200",
        ghost: "bg-transparent hover:bg-white/10 text-zinc-300",
        danger: "bg-red-600 hover:bg-red-500 text-white",
    };

    const sizeClasses = {
        sm: "px-3 py-1.5 text-sm",
        md: "px-4 py-2 text-sm",
        lg: "px-6 py-3 text-base",
    };

    return (
        <motion.button
            whileTap={{ scale: 0.95 }}
            className={`${baseClasses} ${variantClasses[variant]} ${sizeClasses[size]} ${disabled ? "opacity-50 cursor-not-allowed" : ""} ${className}`}
            disabled={disabled || loading}
            {...props}
        >
            {loading ? (
                <span className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
            ) : icon ? (
                <span className="flex-shrink-0">{icon}</span>
            ) : null}
            {children}
        </motion.button>
    );
};

export default Button;
