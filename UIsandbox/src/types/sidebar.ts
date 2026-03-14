/**
 * Sidebar 相关类型定义
 */

export interface SidebarItem {
    id: string;
    title: string;
    priority: number;
    path: string;
    // 标签数据
    tags: string[];
    // 可选字段
    dueUnix?: number;
    isNew?: boolean;
}

export interface SidebarSection {
    id: string;
    title: string;
    count: number;
    color: string; // CSS color, e.g. "var(--text-accent)" or "#4caf50"
    items: SidebarItem[];
}

export interface SidebarState {
    sections: SidebarSection[];
    totalCount: number;
}
