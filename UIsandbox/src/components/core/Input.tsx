/**
 * Input 输入框组件
 */
import { InputHTMLAttributes, forwardRef } from "react";

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
    label?: string;
    error?: string;
    icon?: React.ReactNode;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
    ({ label, error, icon, className = "", ...props }, ref) => {
        return (
            <div className="flex flex-col gap-1.5">
                {label && <label className="text-sm font-medium text-zinc-300">{label}</label>}
                <div className="relative">
                    {icon && (
                        <div className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500">
                            {icon}
                        </div>
                    )}
                    <input
                        ref={ref}
                        className={`
                        w-full bg-zinc-900 border border-zinc-700 
                        focus:border-blue-500 focus:ring-1 focus:ring-blue-500/50 
                        rounded-lg px-3 py-2 text-sm text-white placeholder-zinc-600
                        outline-none transition-all
                        ${icon ? "pl-10" : ""}
                        ${error ? "border-red-500" : ""}
                        ${className}
                    `}
                        {...props}
                    />
                </div>
                {error && <span className="text-xs text-red-400">{error}</span>}
            </div>
        );
    },
);

Input.displayName = "Input";

export default Input;
