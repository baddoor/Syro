/**
 * Select 下拉选择组件
 */
import { SelectHTMLAttributes } from "react";

interface SelectOption {
    label: string;
    value: string;
}

interface SelectProps extends Omit<SelectHTMLAttributes<HTMLSelectElement>, "onChange"> {
    options: SelectOption[];
    onChange: (value: string) => void;
    label?: string;
}

export const Select: React.FC<SelectProps> = ({
    options,
    onChange,
    label,
    value,
    className = "",
    ...props
}) => {
    return (
        <div className="flex flex-col gap-1.5">
            {label && <label className="text-sm font-medium text-zinc-300">{label}</label>}
            <div className="relative">
                <select
                    value={value}
                    onChange={(e) => onChange(e.target.value)}
                    className={`
                        appearance-none w-full
                        bg-zinc-900 border border-zinc-700 
                        text-zinc-200 text-sm 
                        rounded-lg pl-3 pr-8 py-2 
                        outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500/50
                        cursor-pointer transition-all hover:border-zinc-500
                        ${className}
                    `}
                    {...props}
                >
                    {options.map((opt) => (
                        <option
                            key={opt.value}
                            value={opt.value}
                            className="bg-zinc-900 text-zinc-300"
                        >
                            {opt.label}
                        </option>
                    ))}
                </select>
                <div className="absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none text-zinc-500">
                    <svg
                        width="14"
                        height="14"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                    >
                        <path d="M6 9l6 6 6-6" />
                    </svg>
                </div>
            </div>
        </div>
    );
};

export default Select;
