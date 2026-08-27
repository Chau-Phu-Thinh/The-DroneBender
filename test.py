import matplotlib

matplotlib.use("QtAgg")
import matplotlib.pyplot as plt

year = [1920, 1970, 1990, 2006]
pop = [2.519, 3.692, 5.263, 6.972]
plt.scatter(year, pop)
plt.show()
