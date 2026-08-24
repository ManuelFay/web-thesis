"""Focused visual explanation of ColPali's late-interaction operation."""

from manim import (
    AnimationGroup,
    Arrow,
    Create,
    DOWN,
    FadeIn,
    FadeOut,
    Group,
    GrowArrow,
    Indicate,
    LaggedStart,
    LEFT,
    Line,
    MovingCameraScene,
    ORIGIN,
    Rectangle,
    ReplacementTransform,
    RIGHT,
    RoundedRectangle,
    Scene,
    Text,
    Transform,
    UP,
    VGroup,
    WHITE,
    config,
    smooth,
)


BG = "#FCFAF7"
INK = "#16202A"
MUTED = "#667085"
PURPLE = "#9B79AA"
PURPLE_LIGHT = "#F0E6F2"
GREEN = "#4E8A45"
GREEN_LIGHT = "#E7F1E2"
ORANGE = "#F68A17"
ORANGE_LIGHT = "#FFE5C4"
BLUE = "#4D78B2"

config.background_color = BG


def text(value, size=26, color=INK, weight="NORMAL"):
    return Text(value, font="Liberation Sans", font_size=size, color=color, weight=weight)


def rounded(width, height, fill, stroke, radius=0.14, stroke_width=2):
    return RoundedRectangle(
        width=width,
        height=height,
        corner_radius=radius,
        fill_color=fill,
        fill_opacity=1,
        stroke_color=stroke,
        stroke_width=stroke_width,
    )


def vector_glyph(color, fill):
    """A compact column-vector icon with brackets and four feature values."""
    background = rounded(0.55, 0.72, fill, color, 0.10, 1.4)
    features = VGroup()
    opacities = [0.38, 0.88, 0.58, 0.72]
    widths = [0.12, 0.18, 0.15, 0.20]
    for width, opacity in zip(widths, opacities):
        features.add(
            Rectangle(
                width=width,
                height=0.075,
                fill_color=color,
                fill_opacity=opacity,
                stroke_width=0,
            )
        )
    features.arrange(DOWN, buff=0.055).move_to(background)
    left_bracket = VGroup(
        Line(UP * 0.24, DOWN * 0.24, color=color, stroke_width=1.8),
        Line(ORIGIN, RIGHT * 0.07, color=color, stroke_width=1.8).shift(UP * 0.24),
        Line(ORIGIN, RIGHT * 0.07, color=color, stroke_width=1.8).shift(DOWN * 0.24),
    ).move_to(background.get_center() + LEFT * 0.19)
    right_bracket = left_bracket.copy().rotate(3.14159265).move_to(background.get_center() + RIGHT * 0.19)
    return VGroup(background, features, left_bracket, right_bracket)


class LateInteraction(MovingCameraScene):
    values = [
        [0.22, 0.38, 0.51, 0.31, 0.44, 0.35, 0.29, 0.41],
        [0.18, 0.26, 0.34, 0.49, 0.39, 0.28, 0.33, 0.30],
        [0.24, 0.31, 0.42, 0.55, 0.47, 0.36, 0.91, 0.58],
    ]
    words = ["What", "are", "ViTs?"]
    best_columns = [2, 3, 6]

    def construct(self):
        self.camera.background_color = BG
        self.build_layout()
        encoded_vectors = self.animate_visual_encoding()
        encoded_vectors, query_input, query_vectors = self.animate_query_encoding(encoded_vectors)
        self.animate_intro(encoded_vectors, query_input, query_vectors)

        running_total = 0.0
        for row_index in range(3):
            running_total += self.values[row_index][self.best_columns[row_index]]
            self.compare_row(row_index, running_total)

        self.animate_final_sum()

    def build_layout(self):
        self.title = text("Late interaction", 35, INK, "BOLD").to_corner(UP + LEFT, buff=0.34)
        self.subtitle = text(
            "Each query token keeps only its strongest document-patch match",
            20,
            MUTED,
        ).next_to(self.title, DOWN, buff=0.08, aligned_edge=LEFT)

        self.patch_label = text("Document patch vectors", 16, PURPLE, "BOLD")
        self.patch_label.move_to(UP * 2.72 + RIGHT * 0.50)

        self.patch_tokens = VGroup()
        patch_colors = ["#DCC8E2", "#E7D7EA", "#D5BEDD", "#E9DAEC"]
        for index in range(8):
            self.patch_tokens.add(vector_glyph(PURPLE, patch_colors[index % 4]))
        self.patch_tokens.arrange(RIGHT, buff=0.14).move_to(UP * 2.12 + RIGHT * 0.50)

        self.query_label = text("Query tokens", 14, GREEN, "BOLD").move_to(LEFT * 5.45 + UP * 2.04)
        self.query_vector_label = text("Token vectors", 14, BLUE, "BOLD").move_to(LEFT * 3.32 + UP * 2.04)
        self.query_words = VGroup()
        for word in self.words:
            token = rounded(1.38, 0.66, GREEN_LIGHT, GREEN, 0.13, 2)
            label = text(word, 21, GREEN, "BOLD").move_to(token)
            self.query_words.add(VGroup(token, label))
        self.query_words.arrange(DOWN, buff=0.56).move_to(LEFT * 5.45 + DOWN * 0.22)
        self.query_vectors = VGroup(*[vector_glyph(BLUE, "#E4ECF7") for _ in self.words])
        self.query_vectors.arrange(DOWN, buff=0.50).move_to(LEFT * 3.62 + DOWN * 0.22)

        self.query_embedding_arrows = VGroup()
        for row_index in range(3):
            self.query_embedding_arrows.add(
                Arrow(
                    self.query_words[row_index].get_right(),
                    self.query_vectors[row_index].get_left(),
                    buff=0.10,
                    stroke_width=2.4,
                    max_tip_length_to_length_ratio=0.18,
                    color=BLUE,
                )
            )

        self.grid = VGroup()
        self.number_labels = VGroup()
        for row_index, row_values in enumerate(self.values):
            row = VGroup()
            row_labels = VGroup()
            for value in row_values:
                cell = rounded(0.61, 0.61, PURPLE_LIGHT, "#D9C8DD", 0.08, 1.2)
                row.add(cell)
            row.arrange(RIGHT, buff=0.08)
            for value, cell in zip(row_values, row):
                label = text(f"{value:.2f}", 14, INK, "BOLD").move_to(cell)
                label.set_z_index(5)
                row_labels.add(label)
            self.grid.add(row)
            self.number_labels.add(row_labels)
        self.grid.arrange(DOWN, buff=0.61).move_to(RIGHT * 0.50 + DOWN * 0.22)
        for row_index, row in enumerate(self.grid):
            for column_index, cell in enumerate(row):
                self.number_labels[row_index][column_index].move_to(cell)

        self.query_arrows = VGroup()
        for row_index in range(3):
            arrow = Arrow(
                self.query_words[row_index].get_right(),
                self.grid[row_index].get_left(),
                buff=0.13,
                stroke_width=3,
                max_tip_length_to_length_ratio=0.15,
                color=GREEN,
            )
            arrow.put_start_and_end_on(
                self.query_vectors[row_index].get_right() + RIGHT * 0.03,
                self.grid[row_index].get_left(),
            )
            self.query_arrows.add(arrow)

        panel = rounded(2.28, 4.72, WHITE, "#CBD5E1", 0.22, 1.8).move_to(RIGHT * 5.55 + DOWN * 0.03)
        panel_title = text("Running sum", 16, MUTED, "BOLD").move_to(panel.get_top() + DOWN * 0.38)
        score_label = text("score", 18, MUTED).move_to(panel.get_top() + DOWN * 0.92)
        self.score_number = text("0.00", 41, ORANGE, "BOLD").next_to(score_label, DOWN, buff=0.05)
        divider = Line(panel.get_left() + RIGHT * 0.22, panel.get_right() + LEFT * 0.22, color="#E2E8F0")
        divider.move_to(panel.get_center() + UP * 0.43)
        self.sum_lines = VGroup()
        for row_index, word in enumerate(self.words):
            prefix = "" if row_index == 0 else "+ "
            line = text(f"{prefix}max({word})", 15, MUTED)
            line.align_to(panel, LEFT).shift(RIGHT * 0.23)
            line.set_y(panel.get_center()[1] + 0.03 - 0.64 * row_index)
            self.sum_lines.add(line)
        self.score_panel = VGroup(panel, panel_title, score_label, divider, self.sum_lines)

    def animate_visual_encoding(self):
        phase_title = text("Visual document indexing", 35, INK, "BOLD").to_corner(UP + LEFT, buff=0.34)
        phase_subtitle = text("One page becomes a set of patch vectors — computed once, offline", 20, MUTED)
        phase_subtitle.next_to(phase_title, DOWN, buff=0.08, aligned_edge=LEFT)

        page = rounded(2.35, 3.18, WHITE, INK, 0.09, 2)
        page.move_to(LEFT * 4.60 + DOWN * 0.30)
        page_title = Rectangle(width=1.55, height=0.17, fill_color=INK, fill_opacity=0.78, stroke_width=0)
        page_title.move_to(page.get_top() + DOWN * 0.34)
        page_lines = VGroup(
            *[
                Rectangle(
                    width=1.58 - 0.12 * (index % 3),
                    height=0.055,
                    fill_color="#98A2B3",
                    fill_opacity=0.75,
                    stroke_width=0,
                )
                for index in range(6)
            ]
        ).arrange(DOWN, buff=0.11).next_to(page_title, DOWN, buff=0.24)
        chart = rounded(1.58, 0.72, "#EEF3F8", "#CBD5E1", 0.05, 1)
        chart.next_to(page_lines, DOWN, buff=0.22)
        chart_line = VGroup(
            Line(chart.get_left() + RIGHT * 0.18 + DOWN * 0.14, chart.get_center() + LEFT * 0.18 + UP * 0.08, color=ORANGE, stroke_width=3),
            Line(chart.get_center() + LEFT * 0.18 + UP * 0.08, chart.get_right() + LEFT * 0.18 + UP * 0.20, color=ORANGE, stroke_width=3),
        )
        document = VGroup(page, page_title, page_lines, chart, chart_line)

        patches = VGroup()
        patch_colors = [PURPLE, BLUE, ORANGE, GREEN]
        for row in range(4):
            for column in range(3):
                patch = Rectangle(
                    width=0.72,
                    height=0.70,
                    fill_color=patch_colors[(row + column) % 4],
                    fill_opacity=0.20,
                    stroke_color=WHITE,
                    stroke_width=1.4,
                )
                patch.move_to(page.get_center() + LEFT * 0.73 + RIGHT * 0.73 * column + UP * 1.05 + DOWN * 0.70 * row)
                patches.add(patch)

        encoder_shell = rounded(2.05, 2.22, "#DDE9F7", BLUE, 0.22, 2.3)
        encoder_shell.move_to(LEFT * 0.75 + DOWN * 0.30)
        encoder_text = text("ColPali", 27, INK, "BOLD").move_to(encoder_shell)
        encoder = VGroup(encoder_shell, encoder_text)

        encoded_vectors = self.patch_tokens.copy()
        encoded_vectors.arrange_in_grid(rows=2, cols=4, buff=(0.18, 0.20))
        encoded_vectors.scale(1.12).move_to(RIGHT * 4.18 + DOWN * 0.30)

        page_label = text("page split into patches", 18, MUTED, "BOLD").next_to(page, DOWN, buff=0.18)
        encoder_label = text("encode every patch", 18, BLUE, "BOLD").next_to(encoder, DOWN, buff=0.24)
        vector_label = text("one vector per patch", 18, PURPLE, "BOLD").next_to(encoded_vectors, DOWN, buff=0.28)
        first_arrow = Arrow(page.get_right(), encoder.get_left(), buff=0.24, color=ORANGE, stroke_width=4)
        second_arrow = Arrow(encoder.get_right(), encoded_vectors.get_left(), buff=0.24, color=ORANGE, stroke_width=4)
        offline_note = rounded(3.72, 0.54, GREEN_LIGHT, GREEN, 0.15, 1.6).to_edge(DOWN, buff=0.24)
        offline_text = text("No OCR · no layout parsing", 18, GREEN, "BOLD").move_to(offline_note)

        self.play(FadeIn(phase_title, shift=DOWN * 0.08), FadeIn(phase_subtitle), run_time=0.55)
        self.play(FadeIn(document, shift=UP * 0.10), FadeIn(page_label), run_time=0.65)
        self.play(LaggedStart(*[FadeIn(patch) for patch in patches], lag_ratio=0.045), run_time=0.75)
        self.play(GrowArrow(first_arrow), FadeIn(encoder), FadeIn(encoder_label), run_time=0.70)
        self.play(
            Indicate(encoder_shell, color=BLUE, scale_factor=1.06),
            GrowArrow(second_arrow),
            LaggedStart(*[FadeIn(vector, shift=RIGHT * 0.10) for vector in encoded_vectors], lag_ratio=0.08),
            run_time=1.00,
        )
        self.play(FadeIn(vector_label), FadeIn(offline_note), FadeIn(offline_text), run_time=0.55)
        self.wait(0.65)
        self.play(
            FadeOut(VGroup(phase_title, phase_subtitle, document, patches, encoder, page_label, encoder_label, vector_label, first_arrow, second_arrow, offline_note, offline_text)),
            run_time=0.65,
        )
        return encoded_vectors

    def animate_query_encoding(self, encoded_vectors):
        phase_title = text("Query encoding", 35, INK, "BOLD").to_corner(UP + LEFT, buff=0.34)
        phase_subtitle = text("ColPali embeds every query token into its own vector", 20, MUTED)
        phase_subtitle.next_to(phase_title, DOWN, buff=0.08, aligned_edge=LEFT)

        indexed_target = self.patch_tokens.copy().scale(0.76)
        indexed_target.arrange(RIGHT, buff=0.10).move_to(UP * 2.35 + RIGHT * 2.55)
        indexed_label = text("Indexed page vectors", 14, PURPLE, "BOLD")
        indexed_label.next_to(indexed_target, UP, buff=0.10)

        query_input = self.query_words.copy()
        query_input.arrange(DOWN, buff=0.33).move_to(LEFT * 4.75 + DOWN * 0.25)
        input_label = text("Query tokens", 15, GREEN, "BOLD").next_to(query_input, UP, buff=0.18)

        encoder_shell = rounded(2.20, 2.12, "#DDE9F7", BLUE, 0.22, 2.3)
        encoder_shell.move_to(LEFT * 1.25 + DOWN * 0.25)
        encoder_text = text("ColPali", 27, INK, "BOLD").move_to(encoder_shell)
        encoder_note = text("text embeddings", 15, BLUE, "BOLD").next_to(encoder_shell, DOWN, buff=0.20)
        encoder = VGroup(encoder_shell, encoder_text)

        query_vectors = self.query_vectors.copy()
        query_vectors.arrange(DOWN, buff=0.33).move_to(RIGHT * 2.25 + DOWN * 0.25)
        output_labels = VGroup()
        for word, vector in zip(self.words, query_vectors):
            output_labels.add(text(word, 15, BLUE, "BOLD").next_to(vector, RIGHT, buff=0.14))
        output_header = text("Token vectors", 15, BLUE, "BOLD").next_to(query_vectors, UP, buff=0.18)

        input_arrows = VGroup()
        output_arrows = VGroup()
        offsets = [UP * 0.54, ORIGIN, DOWN * 0.54]
        for token, vector, offset in zip(query_input, query_vectors, offsets):
            input_arrows.add(
                Arrow(token.get_right(), encoder_shell.get_left() + offset, buff=0.12, color=GREEN, stroke_width=2.6)
            )
            output_arrows.add(
                Arrow(encoder_shell.get_right() + offset, vector.get_left(), buff=0.12, color=BLUE, stroke_width=2.6)
            )

        self.play(
            FadeIn(phase_title, shift=DOWN * 0.08),
            FadeIn(phase_subtitle),
            Transform(encoded_vectors, indexed_target),
            FadeIn(indexed_label),
            run_time=0.75,
        )
        self.play(
            FadeIn(input_label),
            LaggedStart(*[FadeIn(token, shift=RIGHT * 0.10) for token in query_input], lag_ratio=0.15),
            FadeIn(encoder),
            FadeIn(encoder_note),
            run_time=0.75,
        )
        for index in range(3):
            self.play(
                GrowArrow(input_arrows[index]),
                Indicate(query_input[index], color=GREEN, scale_factor=1.06),
                run_time=0.28,
            )
            self.play(
                GrowArrow(output_arrows[index]),
                FadeIn(query_vectors[index], shift=RIGHT * 0.12),
                FadeIn(output_labels[index], shift=RIGHT * 0.08),
                run_time=0.34,
            )
        self.play(FadeIn(output_header), Indicate(encoder_shell, color=BLUE, scale_factor=1.05), run_time=0.45)
        self.wait(0.45)
        self.play(
            FadeOut(VGroup(
                phase_title,
                phase_subtitle,
                indexed_label,
                input_label,
                encoder,
                encoder_note,
                input_arrows,
                output_arrows,
                output_labels,
                output_header,
            )),
            run_time=0.55,
        )
        return encoded_vectors, query_input, query_vectors

    def animate_intro(self, encoded_vectors, query_input, query_vectors):
        self.play(
            FadeIn(self.title, shift=DOWN * 0.08),
            FadeIn(self.subtitle),
            FadeIn(self.patch_label),
            FadeIn(self.query_label),
            FadeIn(self.query_vector_label),
            ReplacementTransform(encoded_vectors, self.patch_tokens),
            ReplacementTransform(query_input, self.query_words),
            ReplacementTransform(query_vectors, self.query_vectors),
            run_time=0.80,
        )
        self.play(
            FadeIn(self.grid),
            FadeIn(self.score_panel),
            FadeIn(self.score_number),
            LaggedStart(*[GrowArrow(arrow) for arrow in self.query_embedding_arrows], lag_ratio=0.12),
            run_time=0.80,
        )
        self.play(LaggedStart(*[GrowArrow(arrow) for arrow in self.query_arrows], lag_ratio=0.15), run_time=0.55)
        self.wait(0.25)

    def compare_row(self, row_index, running_total):
        row = self.grid[row_index]
        word = self.query_words[row_index]
        best_column = self.best_columns[row_index]
        best_value = self.values[row_index][best_column]

        resting_word = word[0].copy()
        active_word = word[0].copy().set_fill("#D6EACF").set_stroke(ORANGE, width=3)
        scan_box = rounded(0.69, 0.69, ORANGE_LIGHT, ORANGE, 0.10, 3).set_fill(opacity=0.22)
        scan_box.move_to(row[0])
        scan_line = Line(row[0].get_top(), self.patch_tokens[0].get_bottom(), color=ORANGE, stroke_width=2.5)

        prompt = text(f"Compare “{self.words[row_index]}” with every patch", 18, ORANGE, "BOLD")
        prompt.to_edge(DOWN, buff=0.42)
        self.play(Transform(word[0], active_word), FadeIn(scan_box), Create(scan_line), FadeIn(prompt), run_time=0.38)

        self.play(FadeIn(self.number_labels[row_index][0]), run_time=0.12)
        for column in range(1, 8):
            next_box = scan_box.copy().move_to(row[column])
            next_line = Line(row[column].get_top(), self.patch_tokens[column].get_bottom(), color=ORANGE, stroke_width=2.5)
            self.play(
                Transform(scan_box, next_box),
                Transform(scan_line, next_line),
                FadeIn(self.number_labels[row_index][column]),
                run_time=0.16,
                rate_func=smooth,
            )

        best_cell = row[best_column]
        best_number = self.number_labels[row_index][best_column]
        best_fill = best_cell.copy().set_fill(ORANGE, opacity=1).set_stroke(ORANGE, width=2.5)
        best_number_target = best_number.copy().set_color(WHITE)
        best_number_target.move_to(best_number)
        selected_line = Line(
            best_cell.get_top(),
            self.patch_tokens[best_column].get_bottom(),
            color=ORANGE,
            stroke_width=4,
        ).set_z_index(-2)
        max_value = text(f"= {best_value:.2f}", 18, ORANGE, "BOLD")
        max_value.next_to(self.sum_lines[row_index], RIGHT, buff=0.10)

        new_score = text(f"{running_total:.2f}", 41, ORANGE, "BOLD").move_to(self.score_number)
        self.play(
            Transform(scan_box, best_fill.copy()),
            Transform(scan_line, selected_line),
            Transform(best_cell, best_fill),
            Transform(best_number, best_number_target),
            Indicate(self.query_vectors[row_index], color=BLUE, scale_factor=1.12),
            Indicate(self.patch_tokens[best_column], color=ORANGE, scale_factor=1.13),
            run_time=0.55,
        )
        self.play(
            FadeIn(max_value, shift=RIGHT * 0.10),
            Transform(self.score_number, new_score),
            run_time=0.62,
        )
        self.play(Indicate(self.score_number, color=ORANGE, scale_factor=1.12), run_time=0.28)
        self.play(
            FadeOut(prompt),
            Transform(word[0], resting_word),
            FadeOut(scan_box),
            FadeOut(scan_line),
            run_time=0.28,
        )
        self.wait(0.18)

    def animate_final_sum(self):
        final_terms = text("0.51  +  0.49  +  0.91", 27, INK, "BOLD")
        final_equals = text("=  1.91", 29, ORANGE, "BOLD")
        final_formula = VGroup(final_terms, final_equals).arrange(RIGHT, buff=0.28)
        final_formula.set_y(-3.34)

        self.play(
            FadeOut(self.subtitle),
            FadeIn(final_formula, shift=UP * 0.08),
            AnimationGroup(
                *[
                    Indicate(self.grid[row][self.best_columns[row]], color=ORANGE, scale_factor=1.10)
                    for row in range(3)
                ],
                lag_ratio=0.18,
            ),
            run_time=0.80,
        )
        self.play(Indicate(self.score_number, color=ORANGE, scale_factor=1.16), run_time=0.55)
        self.wait(0.75)
        self.animate_corpus_and_ranking()

    def document_card(self, name, score, position):
        shell = rounded(3.50, 1.55, WHITE, "#CBD5E1", 0.20, 1.8)
        page = rounded(0.66, 0.92, "#F8FAFC", PURPLE, 0.07, 1.5)
        page.move_to(shell.get_left() + RIGHT * 0.50)
        page_lines = VGroup(
            *[
                Rectangle(
                    width=0.38,
                    height=0.045,
                    fill_color=PURPLE,
                    fill_opacity=0.55,
                    stroke_width=0,
                )
                for _ in range(4)
            ]
        ).arrange(DOWN, buff=0.08).move_to(page)
        label = text(name, 17, INK, "BOLD")
        label.align_to(shell, LEFT).shift(RIGHT * 1.00).set_y(shell.get_center()[1] + 0.27)
        metric = text("MaxSim score", 12, MUTED)
        metric.align_to(shell, LEFT).shift(RIGHT * 1.00).set_y(shell.get_center()[1] - 0.16)
        value = text(f"{score:.2f}", 25, ORANGE, "BOLD").move_to(shell.get_right() + LEFT * 0.48)
        return VGroup(shell, page, page_lines, label, metric, value).move_to(position)

    def ranking_row(self, rank, name, score, position):
        fill = GREEN_LIGHT if rank == 1 else WHITE
        stroke = GREEN if rank == 1 else "#CBD5E1"
        shell = rounded(7.70, 0.92, fill, stroke, 0.16, 2)
        rank_text = text(f"#{rank}", 24, GREEN if rank == 1 else MUTED, "BOLD")
        rank_text.move_to(shell.get_left() + RIGHT * 0.48)
        doc_text = text(name, 23, INK, "BOLD")
        doc_text.align_to(shell, LEFT).shift(RIGHT * 1.02)
        bar_bg = rounded(3.00, 0.18, "#EDF1F5", "#EDF1F5", 0.09, 0)
        bar_bg.move_to(shell.get_center() + RIGHT * 0.65)
        bar = rounded(3.00 * score / 2.50, 0.18, ORANGE, ORANGE, 0.09, 0)
        bar.align_to(bar_bg, LEFT).move_to(bar_bg, coor_mask=[0, 1, 0]).align_to(bar_bg, LEFT)
        score_text = text(f"{score:.2f}", 25, ORANGE, "BOLD")
        score_text.move_to(shell.get_right() + LEFT * 0.55)
        return VGroup(shell, rank_text, doc_text, bar_bg, bar, score_text).move_to(position)

    def animate_corpus_and_ranking(self):
        original_view = Group(*self.mobjects)
        document_a = self.document_card("Document A", 1.91, ORIGIN).scale(1.32)
        collapse_caption = text("This document becomes one retrieval score", 24, MUTED, "BOLD")
        collapse_caption.next_to(document_a, DOWN, buff=0.30)

        self.play(
            FadeOut(original_view, scale=0.24),
            FadeIn(document_a, scale=0.42),
            FadeIn(collapse_caption, shift=UP * 0.10),
            run_time=1.15,
        )
        self.play(Indicate(document_a[-1], color=ORANGE, scale_factor=1.20), run_time=0.55)
        self.wait(0.45)

        other_specs = [
            ("Document B", 1.27, LEFT * 7.4 + UP * 2.55),
            ("Document C", 2.14, RIGHT * 7.4 + UP * 2.55),
            ("Document D", 0.84, LEFT * 7.4 + DOWN * 2.25),
            ("Document E", 1.63, RIGHT * 7.4 + DOWN * 2.25),
            ("Document F", 2.48, LEFT * 3.9 + DOWN * 5.0),
            ("Document G", 0.62, RIGHT * 3.9 + DOWN * 5.0),
        ]
        other_cards = VGroup(
            *[self.document_card(name, score, position) for name, score, position in other_specs]
        )
        corpus_caption = text("The same MaxSim operation scores every indexed page", 24, MUTED, "BOLD")
        corpus_caption.move_to(UP * 5.55)

        self.play(
            self.camera.frame.animate.scale(1.62),
            document_a.animate.scale(1 / 1.32),
            FadeOut(collapse_caption),
            LaggedStart(*[FadeIn(card, scale=0.90) for card in other_cards], lag_ratio=0.09),
            FadeIn(corpus_caption, shift=UP * 0.15),
            run_time=1.55,
        )
        self.wait(0.65)

        candidates = {
            "Document A": document_a,
            **{name: card for (name, _, _), card in zip(other_specs, other_cards)},
        }
        ranking = [
            ("Document F", 2.48),
            ("Document C", 2.14),
            ("Document A", 1.91),
            ("Document E", 1.63),
            ("Document B", 1.27),
        ]
        rank_rows = VGroup(
            *[
                self.ranking_row(rank, name, score, UP * (2.18 - 1.08 * (rank - 1)))
                for rank, (name, score) in enumerate(ranking, start=1)
            ]
        )
        rank_title = text("Top 5 pages", 35, INK, "BOLD").move_to(UP * 3.52)
        query_pill = rounded(3.30, 0.52, GREEN_LIGHT, GREEN, 0.15, 1.8).move_to(UP * 2.91)
        question_text = VGroup(
            text("What are ViTs", 18, GREEN, "BOLD"),
            text("?", 18, GREEN, "BOLD"),
        ).arrange(RIGHT, buff=0.01)
        query_text = VGroup(
            text("Query:", 18, GREEN, "BOLD"),
            question_text,
        ).arrange(RIGHT, buff=0.12).move_to(query_pill)

        reorganize = []
        final_rows = VGroup()
        for (name, _), row in zip(ranking, rank_rows):
            card = candidates[name]
            target_label = card[3].copy().scale(23 / 17).move_to(row[2])
            target_score = card[5].copy().move_to(row[5])
            final_row = VGroup(card[0], row[1], card[3], row[3], row[4], card[5])
            final_rows.add(final_row)
            reorganize.append(
                AnimationGroup(
                    Transform(card[0], row[0]),
                    FadeOut(card[1], scale=0.75),
                    FadeOut(card[2], scale=0.75),
                    Transform(card[3], target_label),
                    FadeOut(card[4]),
                    Transform(card[5], target_score),
                    FadeIn(row[1]),
                    FadeIn(row[3]),
                    Create(row[4]),
                    lag_ratio=0.04,
                )
            )

        stack_moves = [
            candidates[name].animate.scale(0.62).move_to(row.get_center())
            for (name, _), row in zip(ranking, rank_rows)
        ]
        self.play(
            self.camera.frame.animate.set(width=config.frame_width).move_to(ORIGIN),
            FadeOut(corpus_caption, shift=UP * 0.12),
            FadeOut(candidates["Document D"], shift=DOWN * 0.30, scale=0.85),
            FadeOut(candidates["Document G"], shift=DOWN * 0.30, scale=0.85),
            AnimationGroup(*stack_moves, lag_ratio=0),
            FadeIn(rank_title, shift=DOWN * 0.10),
            FadeIn(query_pill),
            FadeIn(query_text),
            run_time=1.65,
            rate_func=smooth,
        )
        self.play(
            AnimationGroup(*reorganize, lag_ratio=0),
            run_time=0.85,
            rate_func=smooth,
        )
        self.play(
            Indicate(final_rows[0][1], color=GREEN, scale_factor=1.10),
            Indicate(final_rows[0][5], color=ORANGE, scale_factor=1.10),
            run_time=0.55,
        )
        self.wait(1.35)
