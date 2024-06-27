import matplotlib.pyplot as plt

# Data
data = [
    [10, 153, 124],
    [11, 141, 118],
    [12, 131, 109],
    [13, 123, 105],
    [14, 117, 101],
    [15, 111, 98],
    [16, 105, 94],
    [17, 99, 90],
    [18, 94, 87],
    [19, 90, 84],
    [20, 82, 78],
    [21, 78, 74],
    [22, 76, 72],
    [23, 74, 70],
    [24, 72, 69],
    [25, 70, 67],
    [26, 68, 65],
    [27, 67, 64],
    [28, 66, 64],
    [29, 65, 63],
    [30, 64, 62],
    [31, 59, 58],
    [32, 58, 57],
    [33, 53, 52],
    [34, 53, 52],
    [35, 50, 49],
    [36, 49, 48],
    [37, 48, 47],
    [38, 47, 46],
    [39, 45, 45],
]

# Extracting n, y1, and y2 from the data
n = [item[0] for item in data]
y1 = [item[1] for item in data]
y2 = [item[2] for item in data]

# Plotting the data
plt.figure(figsize=(10, 6))
plt.plot(n, y1, label="Trackers with Popularity ≥ n", marker="o")
plt.plot(n, y2, label="Trackers with Popularity ≥ n AND in Disconnect", marker="x")

# Fill the area between the two lines
plt.fill_between(
    n, y1, y2, interpolate=True, color="gray", alpha=0.5, label="Potential New Trackers"
)

# Adding captions
plt.xlabel("Minimum Required Popularity (n)")
plt.ylabel("Number of Trackers")
plt.legend()
plt.grid(True)

# Display the plot
plt.show()
