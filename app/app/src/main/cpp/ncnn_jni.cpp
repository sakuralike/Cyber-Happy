#include <jni.h>

#include <algorithm>
#include <cstring>
#include <memory>
#include <string>
#include <vector>

#include "ncnn/datareader.h"
#include "ncnn/net.h"

namespace {

struct NcnnModel {
    ncnn::Net net;
    std::string param;
    std::vector<unsigned char> bin;
};

bool copyBytes(JNIEnv* env, jbyteArray source, std::vector<unsigned char>& target) {
    if (source == nullptr) return false;
    const jsize length = env->GetArrayLength(source);
    if (length <= 0) return false;
    target.resize(static_cast<size_t>(length));
    env->GetByteArrayRegion(source, 0, length, reinterpret_cast<jbyte*>(target.data()));
    return !env->ExceptionCheck();
}

}  // namespace

extern "C" JNIEXPORT jlong JNICALL
Java_com_cyberfish_app_inference_NcnnNative_create(
    JNIEnv* env,
    jclass,
    jbyteArray paramBytes,
    jbyteArray binBytes) {
    auto model = std::make_unique<NcnnModel>();
    jsize paramLength = paramBytes == nullptr ? 0 : env->GetArrayLength(paramBytes);
    if (paramLength <= 0 || !copyBytes(env, binBytes, model->bin)) return 0;

    model->param.resize(static_cast<size_t>(paramLength));
    env->GetByteArrayRegion(
        paramBytes,
        0,
        paramLength,
        reinterpret_cast<jbyte*>(model->param.data()));
    if (env->ExceptionCheck()) return 0;
    model->param.push_back('\0');

    if (model->net.load_param_mem(model->param.c_str()) != 0) return 0;
    const unsigned char* cursor = model->bin.data();
    ncnn::DataReaderFromMemory reader(cursor);
    if (model->net.load_model(reader) != 0) return 0;
    return reinterpret_cast<jlong>(model.release());
}

extern "C" JNIEXPORT jfloatArray JNICALL
Java_com_cyberfish_app_inference_NcnnNative_detect(
    JNIEnv* env,
    jclass,
    jlong handle,
    jfloatArray input,
    jint inputSize) {
    auto* model = reinterpret_cast<NcnnModel*>(handle);
    if (model == nullptr || input == nullptr || inputSize <= 0) return nullptr;
    const jsize expected = inputSize * inputSize * 3;
    if (env->GetArrayLength(input) != expected) return nullptr;

    std::vector<float> rgb(static_cast<size_t>(expected));
    env->GetFloatArrayRegion(input, 0, expected, rgb.data());
    if (env->ExceptionCheck()) return nullptr;

    ncnn::Mat in(inputSize, inputSize, 3, static_cast<size_t>(4u), static_cast<ncnn::Allocator*>(nullptr));
    float* red = static_cast<float*>(in.channel(0));
    float* green = static_cast<float*>(in.channel(1));
    float* blue = static_cast<float*>(in.channel(2));
    for (int index = 0; index < inputSize * inputSize; ++index) {
        red[index] = rgb[index * 3];
        green[index] = rgb[index * 3 + 1];
        blue[index] = rgb[index * 3 + 2];
    }

    ncnn::Extractor extractor = model->net.create_extractor();
    extractor.set_light_mode(true);
    if (extractor.input("in0", in) != 0) return nullptr;
    ncnn::Mat output;
    if (extractor.extract("out0", output) != 0 || output.dims != 2 || output.h != 5) return nullptr;

    const int candidates = output.w;
    jfloatArray result = env->NewFloatArray(candidates * 5);
    if (result == nullptr) return nullptr;
    std::vector<float> interleaved(static_cast<size_t>(candidates) * 5);
    for (int index = 0; index < candidates; ++index) {
        for (int field = 0; field < 5; ++field) {
            interleaved[index * 5 + field] = output.row(field)[index];
        }
    }
    env->SetFloatArrayRegion(result, 0, static_cast<jsize>(interleaved.size()), interleaved.data());
    return result;
}

extern "C" JNIEXPORT void JNICALL
Java_com_cyberfish_app_inference_NcnnNative_destroy(JNIEnv*, jclass, jlong handle) {
    delete reinterpret_cast<NcnnModel*>(handle);
}
