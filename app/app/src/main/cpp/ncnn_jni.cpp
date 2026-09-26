#include <jni.h>

#include <algorithm>
#include <cstring>
#include <limits>
#include <memory>
#include <string>
#include <vector>

#include "ncnn/datareader.h"
#include "ncnn/net.h"

namespace {

enum class OutputLayout {
    FieldsByCandidates,
    CandidatesByFields,
};

struct NcnnModel {
    ncnn::Net net;
    std::string param;
    std::vector<unsigned char> bin;
    std::string inputName;
    std::string outputName;
    OutputLayout outputLayout = OutputLayout::FieldsByCandidates;
    int valuesPerDetection = 0;
};

bool copyBytes(JNIEnv* env, jbyteArray source, std::vector<unsigned char>& target) {
    if (source == nullptr) return false;
    const jsize length = env->GetArrayLength(source);
    if (length <= 0) return false;
    target.resize(static_cast<size_t>(length));
    env->GetByteArrayRegion(source, 0, length, reinterpret_cast<jbyte*>(target.data()));
    return !env->ExceptionCheck();
}

bool copyString(JNIEnv* env, jstring source, std::string& target) {
    if (source == nullptr) return false;
    const char* value = env->GetStringUTFChars(source, nullptr);
    if (value == nullptr) return false;
    target.assign(value);
    env->ReleaseStringUTFChars(source, value);
    return !env->ExceptionCheck() && !target.empty();
}

bool parseOutputLayout(const std::string& value, OutputLayout& outputLayout) {
    if (value == "FIELDS_BY_CANDIDATES") {
        outputLayout = OutputLayout::FieldsByCandidates;
        return true;
    }
    if (value == "CANDIDATES_BY_FIELDS") {
        outputLayout = OutputLayout::CandidatesByFields;
        return true;
    }
    return false;
}

bool containsName(const std::vector<const char*>& names, const std::string& expected) {
    return std::any_of(names.begin(), names.end(), [&expected](const char* name) {
        return name != nullptr && expected == name;
    });
}

}  // namespace

extern "C" JNIEXPORT jlong JNICALL
Java_com_cyberfish_app_inference_NcnnNative_create(
    JNIEnv* env,
    jclass,
    jbyteArray paramBytes,
    jbyteArray binBytes,
    jstring inputName,
    jstring outputName,
    jstring outputLayout,
    jint valuesPerDetection) {
    auto model = std::make_unique<NcnnModel>();
    jsize paramLength = paramBytes == nullptr ? 0 : env->GetArrayLength(paramBytes);
    std::string outputLayoutValue;
    if (paramLength <= 0 ||
        valuesPerDetection < 5 ||
        !copyBytes(env, binBytes, model->bin) ||
        !copyString(env, inputName, model->inputName) ||
        !copyString(env, outputName, model->outputName) ||
        !copyString(env, outputLayout, outputLayoutValue) ||
        !parseOutputLayout(outputLayoutValue, model->outputLayout)) {
        return 0;
    }
    model->valuesPerDetection = valuesPerDetection;

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
    if (!containsName(model->net.input_names(), model->inputName) ||
        !containsName(model->net.output_names(), model->outputName)) {
        return 0;
    }
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
    if (extractor.input(model->inputName.c_str(), in) != 0) return nullptr;
    ncnn::Mat output;
    if (extractor.extract(model->outputName.c_str(), output) != 0 || output.dims != 2 || output.elempack != 1) {
        return nullptr;
    }

    const bool fieldsByCandidates = model->outputLayout == OutputLayout::FieldsByCandidates;
    const int fields = fieldsByCandidates ? output.h : output.w;
    const int candidates = fieldsByCandidates ? output.w : output.h;
    if (fields != model->valuesPerDetection || candidates <= 0) return nullptr;
    const size_t resultSize = static_cast<size_t>(candidates) * static_cast<size_t>(fields);
    if (resultSize > static_cast<size_t>(std::numeric_limits<jsize>::max())) return nullptr;

    jfloatArray result = env->NewFloatArray(static_cast<jsize>(resultSize));
    if (result == nullptr) return nullptr;
    std::vector<float> interleaved(resultSize);
    for (int index = 0; index < candidates; ++index) {
        for (int field = 0; field < fields; ++field) {
            interleaved[static_cast<size_t>(index) * fields + field] = fieldsByCandidates
                ? output.row(field)[index]
                : output.row(index)[field];
        }
    }
    env->SetFloatArrayRegion(result, 0, static_cast<jsize>(interleaved.size()), interleaved.data());
    return result;
}

extern "C" JNIEXPORT void JNICALL
Java_com_cyberfish_app_inference_NcnnNative_destroy(JNIEnv*, jclass, jlong handle) {
    delete reinterpret_cast<NcnnModel*>(handle);
}
