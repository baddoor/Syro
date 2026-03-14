import os
import random

def generate_long_cloze_file(filename="1000_clozes_long_article.md", num_clozes=1000):
    """生成单文件包含 1000 个挖空的长文本"""
    print(f"正在生成长文本挖空测试文件: {filename} ...")
    with open(filename, "w", encoding="utf-8") as f:
        f.write("# 1000 挖空性能测试长文\n\n")
        f.write("本文档包含一千个随机生成的挖空，用于测试插件的正则匹配、解析和渲染性能。\n\n")
        for i in range(1, num_clozes + 1):
            # 模拟真实的笔记段落
            paragraph = f"这是第 {i} 段笔记内容，我们需要记住这个核心概念：==这是被挖空的第 {i} 个测试词汇==，并且插件应该能迅速解析它。\n\n"
            f.write(paragraph)
    print("长文本生成完毕！\n")

def generate_large_vault(folder_name="10000_cards_vault", num_files=200, cards_per_file=50):
    """生成一万卡的测试库 (200个文件，每个文件50张卡)"""
    print(f"正在生成万卡测试库: 目录 '{folder_name}' ...")
    os.makedirs(folder_name, exist_ok=True)
    
    card_count = 0
    for file_idx in range(1, num_files + 1):
        file_path = os.path.join(folder_name, f"deck_file_{file_idx}.md")
        with open(file_path, "w", encoding="utf-8") as f:
            f.write(f"# 测试卡组 {file_idx}\n\n")
            f.write("以下是批量生成的测试卡片：\n\n")
            for card_idx in range(1, cards_per_file + 1):
                card_count += 1
                # 模拟单行问答卡片
                f.write(f"测试问题 {card_count}：请问这个测试的答案是什么？ :: 这是测试答案 {card_count}\n")
    print(f"万卡库生成完毕！共 {num_files} 个文件，{card_count} 张卡片。")

if __name__ == "__main__":
    # 在当前目录下生成
    generate_long_cloze_file()
    generate_large_vault()
