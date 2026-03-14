/**
 * Toggle 开关组件
 */
import { motion } from "framer-motion";

interface ToggleProps {
    value: boolean;
    onChange: (value: boolean) => void;
    disabled?: boolean;
    size?: "sm" | "md";
}

export const Toggle: React.FC<ToggleProps> = ({
    value,
    onChange,
    disabled = false,
    size = "md",
}) => {
    const sizeClasses = {
        sm: { track: "w-9 h-5", knob: "w-3.5 h-3.5", translate: 16 },
        md: { track: "w-11 h-6", knob: "w-4 h-4", translate: 20 },
    };

    const s = sizeClasses[size];

    return (
        <button
            type="button"
            role="switch"
            aria-checked={value}
            onClick={() => !disabled && onChange(!value)}
            className={`
                ${s.track} rounded-full p-1 transition-colors duration-200 ease-in-out relative
                ${value ? "bg-blue-600" : "bg-zinc-700 hover:bg-zinc-600"}
                ${disabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}
            `}
        >
            <motion.div
                className={`${s.knob} bg-white rounded-full shadow-sm`}
                animate={{ x: value ? s.translate : 0 }}
                transition={{ type: "spring", stiffness: 500, damping: 30 }}
            />
        </button>
    );
};

export default Toggle;
