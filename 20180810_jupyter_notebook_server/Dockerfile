FROM tensorflow/tensorflow

ENV DEBIAN_FRONTEND noninteractive

RUN apt-get update \
  && apt-get install -y python3-pip

ADD requirements.txt requirements.txt
RUN python3 -m pip install --upgrade -r requirements.txt && \
  python3 -m bash_kernel.install

ADD R.bash R.bash
RUN ["/bin/bash", "R.bash"]

EXPOSE 8888
CMD ["/bin/bash", "-c", "jupyter notebook --allow-root --port=8888 --no-browser --ip=* --NotebookApp.token=''"]
