// Catan box insert - full assembly view
// Spec: docs/superpowers/specs/2026-08-02-catan-box-insert-design.md
//
// Everything in the box at once, at its spec'd coordinates.
//
// The hex rack is the real model. The other six parts are placeholder blocks
// at correct external dimensions - swap each for its real model as it gets
// built. Placeholders exist to prove the packing works, not the geometry.
//
// Origin is the box's inside bottom-left corner. X runs right, Y runs back,
// Z runs up.

// Renders the rack at the origin, which is where it belongs, and brings its
// variables into scope.
include <hex_rack.scad>

/* [View] */
show_box = true;
show_lower = true;
show_upper = true;
show_books = true;
// Lift the upper layer clear of the lower one to see underneath
explode = 0; // [0:1:120]

/* [Box] */
box_x = 292;
box_y = 292;
box_z = 86;

/* [Hidden] */
lower_z = 0;
upper_z = 42;
books_z = 82;

// A placeholder for a part not yet modelled
module blank(pos, size, c) {
    color(c, 0.85)
        translate(pos)
            cube(size);
}

// ---------------------------------------------------------------- box

if (show_box)
    color("Tan", 0.10)
        difference() {
            translate([-3, -3, -3]) cube([box_x + 6, box_y + 6, box_z + 3]);
            cube([box_x, box_y, box_z + 1]);
        }

// ---------------------------------------------------------------- lower

// z 0-42. Frame tray, tokens, reference cards, and the ports tray beside
// the rack in region B.
if (show_lower) {
    blank([0, 115, lower_z], [254, 76, 42], "SteelBlue");     // frame tray
    blank([0, 193, lower_z], [100, 90, 40], "DarkSeaGreen");  // tokens, dice
    blank([102, 193, lower_z], [96, 94, 32], "Khaki");        // reference cards
    blank([206, 0, lower_z], [86, 94, 20], "Plum");           // ports + chits
}

// ---------------------------------------------------------------- upper

// z 42-82. Card modules stacked in pairs, player trays stacked in pairs.
if (show_upper) {
    z = upper_z + explode;

    for (i = [0, 1])
        blank([0, 115, z + i * 20], [173, 85, 20], "IndianRed");

    for (col = [0, 1, 2], i = [0, 1])
        blank([col * 97, 202, z + i * 20], [95, 60, 20], "SlateGray");
}

// ---------------------------------------------------------------- books

// The rulebooks are the retention lid - they hold the loose-fit trays down.
if (show_books)
    color("Wheat", 0.5)
        translate([20, 6, books_z + explode])
            cube([250, 280, 3]);

// ---------------------------------------------------------------- report

echo(str("box interior: ", box_x, " x ", box_y, " x ", box_z, "mm"));
echo(str("rack occupies: x 0-", outer_l, ", y 0-", outer_d));
echo(str("tallest point: tile top at ", floor_t + tile_across_flats,
         "mm, books to ", floor_t + tile_across_flats + 3, "mm of ", box_z));
