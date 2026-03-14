import os

def generate_anki_clozes(count=10000, clozes_per_line=10):
    content = "# Stress Test Anki Cloze\n\n"
    # Each logical block gives clozes_per_line cards
    blocks_needed = count // clozes_per_line
    
    global_card_index = 1
    for i in range(blocks_needed):
        # We want clozes_per_line IDs (c1 to cN) in one block
        # According to the user: "一行内部添加十张Cloze id的卡，然后带有两个换行符用来分割 id"
        # Since Syro parses clozes in the same file/note, we can separate them by \n\n
        block_parts = []
        for j in range(clozes_per_line):
            cloze_id = j + 1
            block_parts.append(f"Anki Card {global_card_index}: {{{{c{cloze_id}::Test Answer {global_card_index}}}}}")
            global_card_index += 1
        
        # Join with dual newlines
        line_content = "\n\n".join(block_parts)
        content += line_content + "\n\n---\n\n"
        
    return content

if __name__ == "__main__":
    output_path = r"c:\Users\85870\Desktop\Syro-Github\plugin_test\StressTestAnki.md"
    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    
    print(f"Generating {10000} Anki Cloze cards...")
    with open(output_path, "w", encoding="utf-8") as f:
        f.write(generate_anki_clozes(10000, 10))
    print(f"Success! Saved to {output_path}")
