import random
level = 50
base_duration = 2900
duration_coef = (1-(level-1)*0.002) * 0.86 * 0.95# * (1/1.2) * 0.95
duration = base_duration * duration_coef
skil_ratio = 0.04 * 1.36 * 1.2

# 81 -    0.45
# 80 - 61 0.52
# 60 - 41 0.62
# 40 - 21 0.71
# 20 -  0 1.00

def real_duration(genki, duration):
    _genki = round(genki)
    if _genki > 80:
        return duration * 0.45
    elif _genki > 60:
        return duration * 0.52
    elif _genki > 40:
        return duration * 0.71
    else:
        return duration

energy = 100
day_minutes = 630
UPPER_LIMIT = 60 * 60 * 15.5

class Poke():
    def __init__(self, duration, skill_ratio, up_genki, genki=100):
        self.seconds = 0
        self.genki = genki
        self.duration = duration
        self.skill_ratio = skill_ratio
        self.up_genki = up_genki
        self.count = 0

    def next(self):
        d = real_duration(self.genki, self.duration)
        self.genki = self.genki - d / 600
        self.seconds += d
        if random.random() < self.skill_ratio:
            self.count += 1
            self.genki += self.up_genki
            if (self.genki > 150):
                self.genki = 150

    def meetLimit(self):
        if self.seconds > UPPER_LIMIT:
            return True
        return False


def test():
    for i in range(100000):
        poke = Poke(duration, skil_ratio, 18.1, 115)
        while not poke.meetLimit():
            poke.next()
        print(poke.genki)


if __name__ == "__main__":
    test()
